/**
 * Fetches tree-sitter-javascript.wasm built for current Tree-sitter ABI (matches web-tree-sitter 0.26).
 * Official release: https://github.com/tree-sitter/tree-sitter-javascript/releases
 */
import fs from 'node:fs'
import https from 'node:https'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '../src/wasm')
const outFile = path.join(outDir, 'tree-sitter-javascript.wasm')
const url =
  'https://github.com/tree-sitter/tree-sitter-javascript/releases/download/v0.25.0/tree-sitter-javascript.wasm'

function download(src, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    const req = https.get(src, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        const loc = res.headers.location
        file.close()
        fs.unlinkSync(dest)
        if (!loc) {
          reject(new Error('Redirect without location'))
          return
        }
        download(loc, dest).then(resolve).catch(reject)
        return
      }
      if (res.statusCode !== 200) {
        file.close()
        if (fs.existsSync(dest)) fs.unlinkSync(dest)
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }
      res.pipe(file)
      file.on('finish', () => {
        file.close()
        resolve()
      })
    })
    req.on('error', (err) => {
      file.close()
      if (fs.existsSync(dest)) fs.unlinkSync(dest)
      reject(err)
    })
  })
}

fs.mkdirSync(outDir, { recursive: true })
if (fs.existsSync(outFile) && fs.statSync(outFile).size > 50_000) {
  console.log('tree-sitter-javascript.wasm already present, skip')
  process.exit(0)
}

await download(url, outFile)
console.log('Wrote', outFile)
