import { useCallback, useRef } from 'react'
// Vite：用 ?url 固定 WASM 地址，避免 Emscripten 用 import.meta.url 拼出来的 URL 在 dev 下返回 index.html（魔数变成 <!do）
import quickjsWasmUrl from '@jitl/quickjs-wasmfile-release-sync/wasm?url'
import {
  RELEASE_SYNC,
  newQuickJSWASMModuleFromVariant,
  newVariant,
  shouldInterruptAfterDeadline,
  type QuickJSWASMModule,
} from 'quickjs-emscripten'
import type { ProblemGradingContext, TestCase, TestResult } from '../types'
import { expectedAcceptedAlternatives } from './expected-ans-alternatives'

const EXECUTION_TIMEOUT_MS = 5000

interface SandboxResult {
  output: string
  error?: string
  timeMs: number
}

function disposeEvalResult(r: {
  value?: import('quickjs-emscripten').QuickJSHandle
  error?: import('quickjs-emscripten').QuickJSHandle
}) {
  try {
    r.error?.dispose()
  } catch {
    /* ignore */
  }
  try {
    r.value?.dispose()
  } catch {
    /* ignore */
  }
}

/** 与题目期望一致：数组/对象用 JSON.stringify（String([0,1]) 会得到 "0,1" 误判） */
function actualToComparable(raw: unknown): string {
  if (raw === undefined || raw === null) return String(raw)
  if (typeof raw === 'object') {
    try {
      return JSON.stringify(raw)
    } catch {
      return String(raw)
    }
  }
  return String(raw).trim()
}

/**
 * quickjs `dump(error)` 常为普通对象；`String(obj)` 会变成 [object Object]。
 * 优先 JSON；若得到 `{}`（如 Error 不可枚举字段），再列出自有属性。
 */
function quickjsDumpToText(raw: unknown): string {
  if (raw === undefined || raw === null) return String(raw)
  if (typeof raw !== 'object') return String(raw).trim()
  const o = raw as object
  let json: string | undefined
  try {
    json = JSON.stringify(o, null, 2)
  } catch {
    json = undefined
  }
  if (json && json !== '{}') return json

  const parts: string[] = []
  for (const key of Object.getOwnPropertyNames(o)) {
    let val: unknown
    try {
      val = (o as Record<string, unknown>)[key]
    } catch {
      val = undefined
    }
    if (val !== undefined && val !== null && typeof val === 'object') {
      try {
        parts.push(`${key}: ${JSON.stringify(val)}`)
      } catch {
        parts.push(`${key}: [Object]`)
      }
    } else {
      parts.push(`${key}: ${String(val)}`)
    }
  }
  if (parts.length > 0) return parts.join('\n')
  return json ?? String(o)
}

function assertSafeIdentifier(name: string): string {
  if (!/^[a-zA-Z_$][\w$]*$/.test(name)) {
    throw new Error(`非法入口名（仅允许标识符）: ${name}`)
  }
  return name
}

function expectedComparable(ans: unknown): string {
  return actualToComparable(ans)
}

/** verify 分支：从 run.js 返回的 JSON 载荷解析 flag（1/0/nonbool:…）与选手输出展示串 */
function parseVerifyRunPayload(raw: unknown): { flag: string; cand: string } | null {
  let text = String(raw ?? '').trim()
  if (!text) return null
  const tryParse = (t: string): { flag: string; cand: string } | null => {
    try {
      const o = JSON.parse(t) as unknown
      if (o && typeof o === 'object' && 'f' in o && 'c' in o) {
        return {
          flag: String((o as { f: unknown }).f),
          cand: String((o as { c: unknown }).c),
        }
      }
    } catch {
      return null
    }
    return null
  }
  const direct = tryParse(text)
  if (direct) return direct
  try {
    const inner = JSON.parse(text)
    if (typeof inner === 'string') return tryParse(inner)
  } catch {
    /* ignore */
  }
  return null
}

async function evalUserCase(
  QuickJS: QuickJSWASMModule,
  code: string,
  testCase: TestCase,
  grading: ProblemGradingContext,
): Promise<TestResult> {
  const startTime = performance.now()
  const vm = QuickJS.newContext()
  vm.runtime.setInterruptHandler(
    shouldInterruptAfterDeadline(Date.now() + EXECUTION_TIMEOUT_MS),
  )

  const entryPoint = assertSafeIdentifier(grading.entryPoint)
  const inputDisplay = testCase.input
  const expectedDisplay = testCase.expectedOutput

  try {
    const load = vm.evalCode(code, 'user.js', { type: 'global' })
    if (load.error) {
      let errText = ''
      try {
        errText = quickjsDumpToText(vm.dump(load.error))
      } catch {
        errText = '（无法读取错误信息）'
      }
      disposeEvalResult(load)
      return {
        testCaseId: testCase.id,
        input: inputDisplay,
        expectedOutput: expectedDisplay,
        actualOutput: errText ? `加载代码失败: ${errText}` : '',
        passed: false,
        timeMs: performance.now() - startTime,
      }
    }
    disposeEvalResult(load)

    if (grading.gradingMode === 'verify') {
      const verifySrc = grading.verifySource?.trim()
      if (!verifySrc) {
        return {
          testCaseId: testCase.id,
          input: inputDisplay,
          expectedOutput: expectedDisplay,
          actualOutput: '题目未配置 verify 源码',
          passed: false,
          timeMs: performance.now() - startTime,
        }
      }
      const vload = vm.evalCode(verifySrc, 'verify.js', { type: 'global' })
      if (vload.error) {
        let errText = ''
        try {
          errText = quickjsDumpToText(vm.dump(vload.error))
        } catch {
          errText = '（无法读取错误信息）'
        }
        disposeEvalResult(vload)
        return {
          testCaseId: testCase.id,
          input: inputDisplay,
          expectedOutput: expectedDisplay,
          actualOutput: `加载 verify 失败: ${errText}`,
          passed: false,
          timeMs: performance.now() - startTime,
        }
      }
      disposeEvalResult(vload)

      const dataJson = JSON.stringify(testCase.data)
      const callScript = `(function(){
  const __args = ${dataJson};
  const __cand = ${entryPoint}.apply(null, __args);
  const __ok = verify.apply(null, __args.concat([__cand]));
  const __candStr = typeof __cand === 'object' && __cand !== null ? JSON.stringify(__cand) : String(__cand).trim();
  const __flag = __ok === true ? '1' : __ok === false ? '0' : 'nonbool:' + String(__ok);
  return JSON.stringify({ f: __flag, c: __candStr });
})()`

      const call = vm.evalCode(callScript, 'run.js', { type: 'global' })
      if (call.error) {
        let errText = ''
        try {
          errText = quickjsDumpToText(vm.dump(call.error))
        } catch {
          errText = '（无法读取错误信息）'
        }
        disposeEvalResult(call)
        return {
          testCaseId: testCase.id,
          input: inputDisplay,
          expectedOutput: expectedDisplay,
          actualOutput: errText ? `运行失败: ${errText}` : '',
          passed: false,
          timeMs: performance.now() - startTime,
        }
      }

      const raw = call.value !== undefined ? vm.dump(call.value) : ''
      disposeEvalResult(call)
      const payload = parseVerifyRunPayload(raw)
      const flag = payload?.flag ?? String(raw).trim()
      const passed = flag === '1'
      const actualOutput =
        payload?.cand ??
        (passed ? 'true' : flag === '0' ? 'false' : flag)

      return {
        testCaseId: testCase.id,
        input: inputDisplay,
        expectedOutput: expectedDisplay || '(verify)',
        actualOutput,
        passed,
        timeMs: performance.now() - startTime,
      }
    }

    const dataJson = JSON.stringify(testCase.data)
    const callScript = `(function(){
  const __args = ${dataJson};
  const __r = ${entryPoint}.apply(null, __args);
  return typeof __r === 'object' && __r !== null ? JSON.stringify(__r) : String(__r).trim();
})()`

    const call = vm.evalCode(callScript, 'run.js', { type: 'global' })
    if (call.error) {
      let errText = ''
      try {
        errText = quickjsDumpToText(vm.dump(call.error))
      } catch {
        errText = '（无法读取错误信息）'
      }
      disposeEvalResult(call)
      return {
        testCaseId: testCase.id,
        input: inputDisplay,
        expectedOutput: expectedDisplay,
        actualOutput: errText ? `运行失败: ${errText}` : '',
        passed: false,
        timeMs: performance.now() - startTime,
      }
    }

    const raw = call.value !== undefined ? vm.dump(call.value) : ''
    disposeEvalResult(call)
    const actualOutput = actualToComparable(raw)
    let passed: boolean
    if (testCase.ans !== undefined) {
      const alts = expectedAcceptedAlternatives(testCase.ans)
      passed =
        alts.length > 0 &&
        alts.some((v) => actualOutput === expectedComparable(v))
    } else {
      passed = actualOutput === expectedDisplay
    }

    return {
      testCaseId: testCase.id,
      input: inputDisplay,
      expectedOutput: expectedDisplay,
      actualOutput,
      passed,
      timeMs: performance.now() - startTime,
    }
  } catch (e: unknown) {
    const msg =
      e instanceof Error ? (e.stack ?? e.message) : quickjsDumpToText(e)
    return {
      testCaseId: testCase.id,
      input: inputDisplay,
      expectedOutput: expectedDisplay,
      actualOutput: `沙箱异常: ${msg}`,
      passed: false,
      timeMs: performance.now() - startTime,
    }
  } finally {
    try {
      vm.dispose()
    } catch {
      /* ignore */
    }
  }
}

export function useSandbox() {
  const moduleRef = useRef<QuickJSWASMModule | null>(null)

  const initQuickJS = useCallback(async () => {
    if (!moduleRef.current) {
      try {
        const variant = newVariant(RELEASE_SYNC, { wasmLocation: quickjsWasmUrl })
        moduleRef.current = await newQuickJSWASMModuleFromVariant(variant)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        throw new Error(`评测环境加载失败。请刷新页面或重启本地开发服务后再试。详情：${msg}`)
      }
    }
    return moduleRef.current
  }, [])

  const runCode = useCallback(
    async (
      code: string,
      testCases: TestCase[],
      grading: ProblemGradingContext,
    ): Promise<TestResult[]> => {
      const QuickJS = await initQuickJS()
      const results: TestResult[] = []
      for (const testCase of testCases) {
        results.push(await evalUserCase(QuickJS, code, testCase, grading))
      }
      return results
    },
    [initQuickJS],
  )

  const runCodeWithProgress = useCallback(
    async (
      code: string,
      testCases: TestCase[],
      grading: ProblemGradingContext,
      onProgress: (done: number, total: number, last?: TestResult) => void,
    ): Promise<TestResult[]> => {
      const QuickJS = await initQuickJS()
      const results: TestResult[] = []
      onProgress(0, testCases.length)
      for (let i = 0; i < testCases.length; i++) {
        const r = await evalUserCase(QuickJS, code, testCases[i], grading)
        results.push(r)
        onProgress(i + 1, testCases.length, r)
      }
      return results
    },
    [initQuickJS],
  )

  const runCodeWithTimeout = useCallback(
    async (code: string, data: unknown[], entryPoint: string): Promise<SandboxResult> => {
      const QuickJS = await initQuickJS()
      const startTime = performance.now()
      const vm = QuickJS.newContext()
      const ep = assertSafeIdentifier(entryPoint)
      vm.runtime.setInterruptHandler(
        shouldInterruptAfterDeadline(Date.now() + EXECUTION_TIMEOUT_MS),
      )
      try {
        const load = vm.evalCode(code, 'user.js', { type: 'global' })
        if (load.error) {
          disposeEvalResult(load)
          return {
            output: '',
            error: 'Load failed',
            timeMs: performance.now() - startTime,
          }
        }
        disposeEvalResult(load)

        const dataJson = JSON.stringify(data)
        const call = vm.evalCode(
          `(function(){
  const __args = ${dataJson};
  const __r = ${ep}.apply(null, __args);
  return typeof __r === 'object' && __r !== null ? JSON.stringify(__r) : String(__r).trim();
})()`,
          'run.js',
          { type: 'global' },
        )
        if (call.error) {
          disposeEvalResult(call)
          return {
            output: '',
            error: 'Execution failed',
            timeMs: performance.now() - startTime,
          }
        }
        const raw = call.value !== undefined ? vm.dump(call.value) : ''
        disposeEvalResult(call)
        return { output: actualToComparable(raw), timeMs: performance.now() - startTime }
      } catch (e: any) {
        return {
          output: '',
          error: e?.message || 'Execution failed',
          timeMs: performance.now() - startTime,
        }
      } finally {
        vm.dispose()
      }
    },
    [initQuickJS],
  )

  return {
    runCode,
    runCodeWithProgress,
    runCodeWithTimeout,
    initSandbox: initQuickJS,
  }
}
