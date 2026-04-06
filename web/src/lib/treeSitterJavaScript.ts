import { Language, Parser, Query, type QueryCapture } from 'web-tree-sitter'
import treeSitterCoreWasmUrl from 'web-tree-sitter/web-tree-sitter.wasm?url'
import javascriptLangWasmUrl from '../wasm/tree-sitter-javascript.wasm?url'
import {
  JAVASCRIPT_HIGHLIGHTS_MINIMAL_SCM,
  JAVASCRIPT_HIGHLIGHTS_SCM,
} from './javascriptHighlightQuery'

const CAPTURE_PRIORITY: Record<string, number> = {
  comment: 100,
  string: 95,
  'string.special': 94,
  embedded: 93,
  keyword: 90,
  'constant.builtin': 88,
  number: 85,
  operator: 82,
  'function.method': 81,
  function: 80,
  'function.builtin': 79,
  constructor: 78,
  'variable.builtin': 77,
  constant: 76,
  'punctuation.special': 74,
  'punctuation.bracket': 72,
  'punctuation.delimiter': 71,
  property: 60,
  variable: 50,
}

/** Inline colors so highlighting works even if Tailwind/layer order hides `.hl-*` rules. */
const CAPTURE_STYLE: Record<string, string> = {
  keyword: 'color:hsl(239 78% 72%)',
  string: 'color:hsl(152 48% 58%)',
  'string.special': 'color:hsl(152 48% 58%)',
  embedded: 'color:hsl(172 52% 60%)',
  comment: 'color:hsl(215 14% 52%);font-style:italic',
  number: 'color:hsl(38 88% 66%)',
  operator: 'color:hsl(330 58% 72%)',
  'function.method': 'color:hsl(199 70% 70%)',
  function: 'color:hsl(199 70% 70%)',
  'function.builtin': 'color:hsl(199 70% 70%)',
  constructor: 'color:hsl(48 82% 68%)',
  'variable.builtin': 'color:hsl(263 62% 72%)',
  'constant.builtin': 'color:hsl(263 62% 72%)',
  constant: 'color:hsl(48 82% 68%)',
  'punctuation.special': 'color:hsl(240 10% 62%)',
  'punctuation.bracket': 'color:hsl(240 10% 62%)',
  'punctuation.delimiter': 'color:hsl(240 10% 62%)',
  property: 'color:hsl(188 58% 66%)',
  variable: 'color:hsl(var(--arena-code-fg))',
}

function captureToClass(name: string): string {
  return `hl-${name.replace(/\./g, '-')}`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** ECMAScript LineTerminator (comments / strings differ from template literals). */
function isEcmaLineTerminatorAt(source: string, j: number): boolean {
  const x = source[j]
  if (x === '\n' || x === '\r' || x === '\u2028' || x === '\u2029') return true
  return false
}

/**
 * web-tree-sitter exposes `node.startIndex` / `node.endIndex` as UTF-16 code-unit indices
 * (verified: `getText` uses `source.slice(startIndex)` which is a JS string operation).
 * Map captures onto a code-unit array and merge runs of same highlight class into `<span>`s.
 */
function buildHighlightIndex(source: string, captures: QueryCapture[]): (string | null)[] {
  const len = source.length
  const bestPri = new Int16Array(len).fill(-1)
  const bestName = new Array<string | null>(len).fill(null)

  for (const cap of captures) {
    const name = cap.name
    const p = CAPTURE_PRIORITY[name] ?? 5
    const start = cap.node.startIndex
    const end = cap.node.endIndex
    for (let i = start; i < end && i < len; i++) {
      if (p >= bestPri[i]) {
        bestPri[i] = p
        bestName[i] = name
      }
    }
  }
  return bestName
}

function indexRangeToHtml(
  source: string,
  bestName: (string | null)[],
  rangeStart: number,
  rangeEnd: number,
): string {
  if (rangeStart >= rangeEnd) return ''

  const parts: string[] = []
  let buf = ''
  let activeName: string | null | undefined

  const flush = () => {
    if (!buf) return
    const esc = escapeHtml(buf)
    if (activeName) {
      const style = CAPTURE_STYLE[activeName] ?? CAPTURE_STYLE.variable
      parts.push(`<span class="${captureToClass(activeName)}" style="${style}">${esc}</span>`)
    } else {
      parts.push(esc)
    }
    buf = ''
  }

  for (let i = rangeStart; i < rangeEnd; i++) {
    const name = bestName[i]!
    if (activeName === undefined) {
      activeName = name
    } else if (name !== activeName) {
      flush()
      activeName = name
    }
    buf += source[i]!
  }
  flush()
  return parts.join('')
}

function capturesToHtml(source: string, captures: QueryCapture[]): string {
  const len = source.length
  if (len === 0) return ''
  const bestName = buildHighlightIndex(source, captures)
  return indexRangeToHtml(source, bestName, 0, len)
}

/** Newline boundaries aligned with `diff` line chunks (each line excludes `\n`). */
function sourceLineRangesForDiff(source: string): Array<{ start: number; end: number }> {
  const lines: Array<{ start: number; end: number }> = []
  let start = 0
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') {
      lines.push({ start, end: i })
      start = i + 1
    }
  }
  lines.push({ start, end: source.length })
  return lines
}

const JS_KEYWORDS = new Set([
  'as',
  'async',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'export',
  'extends',
  'finally',
  'for',
  'from',
  'function',
  'get',
  'if',
  'import',
  'in',
  'instanceof',
  'let',
  'new',
  'of',
  'return',
  'set',
  'static',
  'switch',
  'target',
  'throw',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
])

/** Lexical JS highlighter (ASCII-oriented); used when Tree-sitter returns no captures. */
export function highlightJavaScriptRegexHtml(source: string): string {
  const out: string[] = []
  const n = source.length
  let i = 0

  const span = (kind: string, text: string) => {
    const esc = escapeHtml(text)
    const style = CAPTURE_STYLE[kind] ?? CAPTURE_STYLE.variable
    out.push(`<span class="${captureToClass(kind)}" style="${style}">${esc}</span>`)
  }

  while (i < n) {
    const c = source[i]!

    if (c === '\r') {
      i++
      continue
    }
    if (c === ' ' || c === '\t' || c === '\n') {
      let j = i + 1
      while (j < n) {
        const x = source[j]!
        if (x === ' ' || x === '\t' || x === '\n' || x === '\r') j++
        else break
      }
      out.push(escapeHtml(source.slice(i, j)))
      i = j
      continue
    }

    if (c === '/' && source[i + 1] === '/') {
      let j = i + 2
      while (j < n && !isEcmaLineTerminatorAt(source, j)) j++
      span('comment', source.slice(i, j))
      i = j
      continue
    }

    if (c === '/' && source[i + 1] === '*') {
      let j = i + 2
      while (j < n - 1 && !(source[j] === '*' && source[j + 1] === '/')) j++
      j = j < n - 1 ? j + 2 : n
      span('comment', source.slice(i, j))
      i = j
      continue
    }

    if (c === "'") {
      let j = i + 1
      while (j < n) {
        const x = source[j]!
        if (isEcmaLineTerminatorAt(source, j)) break
        if (x === '\\') {
          j += 2
          continue
        }
        if (x === "'") {
          j++
          break
        }
        j++
      }
      span('string', source.slice(i, j))
      i = j
      continue
    }

    if (c === '"') {
      let j = i + 1
      while (j < n) {
        const x = source[j]!
        if (isEcmaLineTerminatorAt(source, j)) break
        if (x === '\\') {
          j += 2
          continue
        }
        if (x === '"') {
          j++
          break
        }
        j++
      }
      span('string', source.slice(i, j))
      i = j
      continue
    }

    if (c === '`') {
      let j = i + 1
      while (j < n) {
        const x = source[j]!
        if (x === '\\') {
          j += 2
          continue
        }
        if (x === '`') {
          j++
          break
        }
        j++
      }
      span('string', source.slice(i, j))
      i = j
      continue
    }

    if (c >= '0' && c <= '9') {
      let j = i + 1
      while (j < n && /[0-9._eE+-xXa-fA-Fn]/.test(source[j]!)) j++
      span('number', source.slice(i, j))
      i = j
      continue
    }

    if (/[a-zA-Z_$]/.test(c)) {
      let j = i + 1
      while (j < n && /[\w$]/.test(source[j]!)) j++
      const w = source.slice(i, j)
      span(JS_KEYWORDS.has(w) ? 'keyword' : 'variable', w)
      i = j
      continue
    }

    out.push(escapeHtml(c))
    i++
  }

  return out.join('')
}

let initPromise: Promise<{ parser: Parser; query: Query }> | null = null

/**
 * Load grammar wasm as bytes. Avoid passing a URL string to Language.load: in the browser,
 * some Vite/polyfill setups define `process.versions.node`, which makes web-tree-sitter
 * wrongly use `fs.readFile` instead of `fetch` (so highlighting silently fails after catch).
 */
async function loadJavaScriptLanguage(): Promise<Language> {
  const response = await fetch(javascriptLangWasmUrl)
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(
      `Failed to fetch tree-sitter-javascript.wasm (${response.status}): ${detail.slice(0, 200)}`,
    )
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  return Language.load(bytes)
}

async function initEngine(): Promise<{ parser: Parser; query: Query }> {
  await Parser.init({
    locateFile: (file: string) => {
      if (file === 'web-tree-sitter.wasm') return treeSitterCoreWasmUrl
      return file
    },
  })

  const language = await loadJavaScriptLanguage()
  const parser = new Parser()
  parser.setLanguage(language)
  let query: Query
  try {
    query = new Query(language, JAVASCRIPT_HIGHLIGHTS_SCM)
  } catch {
    query = new Query(language, JAVASCRIPT_HIGHLIGHTS_MINIMAL_SCM)
  }
  return { parser, query }
}

export function getJavaScriptHighlightEngine(): Promise<{ parser: Parser; query: Query }> {
  if (!initPromise) {
    initPromise = initEngine().catch((err) => {
      initPromise = null
      throw err
    })
  }
  return initPromise
}

export async function highlightJavaScriptToHtml(source: string): Promise<string> {
  if (!source) return ''
  try {
    const { parser, query } = await getJavaScriptHighlightEngine()
    const tree = parser.parse(source)
    if (!tree) return highlightJavaScriptRegexHtml(source)
    try {
      const captures = query.captures(tree.rootNode)
      const html = capturesToHtml(source, captures)
      if (!html.includes('<span')) {
        return highlightJavaScriptRegexHtml(source)
      }
      return html
    } finally {
      tree.delete()
    }
  } catch {
    return highlightJavaScriptRegexHtml(source)
  }
}

/**
 * Full-buffer Tree-sitter parse, then slice highlight by source line ranges (valid JS context preserved).
 */
export async function highlightJavaScriptLinesToHtml(source: string): Promise<string[]> {
  const ranges = sourceLineRangesForDiff(source)
  if (ranges.length === 0) return []

  const mapRegex = () => ranges.map(({ start, end }) => highlightJavaScriptRegexHtml(source.slice(start, end)))

  try {
    const { parser, query } = await getJavaScriptHighlightEngine()
    const tree = parser.parse(source)
    if (!tree) return mapRegex()
    try {
      const captures = query.captures(tree.rootNode)
      const bestName = buildHighlightIndex(source, captures)
      const lines = ranges.map(({ start, end }) => indexRangeToHtml(source, bestName, start, end))
      const joined = lines.join('')
      if (!joined.includes('<span')) {
        return mapRegex()
      }
      return lines
    } finally {
      tree.delete()
    }
  } catch {
    return mapRegex()
  }
}
