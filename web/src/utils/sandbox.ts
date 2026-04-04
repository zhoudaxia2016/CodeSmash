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
import type { TestCase, TestResult } from '../types'

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

async function evalMainCase(
  QuickJS: QuickJSWASMModule,
  code: string,
  testCase: TestCase,
): Promise<TestResult> {
  const startTime = performance.now()
  const vm = QuickJS.newContext()
  vm.runtime.setInterruptHandler(
    shouldInterruptAfterDeadline(Date.now() + EXECUTION_TIMEOUT_MS),
  )

  try {
    const load = vm.evalCode(code, 'user.js', { type: 'global' })
    if (load.error) {
      let errText = ''
      try {
        errText = String(vm.dump(load.error))
      } catch {
        errText = '（无法读取错误信息）'
      }
      disposeEvalResult(load)
      return {
        testCaseId: testCase.id,
        input: testCase.input,
        expectedOutput: testCase.expectedOutput,
        actualOutput: errText ? `加载代码失败: ${errText}` : '',
        passed: false,
        timeMs: performance.now() - startTime,
      }
    }
    disposeEvalResult(load)

    const call = vm.evalCode(
      `(function(){ const __r = main(${testCase.input}); return typeof __r === 'object' && __r !== null ? JSON.stringify(__r) : String(__r).trim(); })()`,
      'run.js',
      { type: 'global' },
    )
    if (call.error) {
      let errText = ''
      try {
        errText = String(vm.dump(call.error))
      } catch {
        errText = '（无法读取错误信息）'
      }
      disposeEvalResult(call)
      return {
        testCaseId: testCase.id,
        input: testCase.input,
        expectedOutput: testCase.expectedOutput,
        actualOutput: errText ? `运行失败: ${errText}` : '',
        passed: false,
        timeMs: performance.now() - startTime,
      }
    }

    const raw = call.value !== undefined ? vm.dump(call.value) : ''
    disposeEvalResult(call)
    const actualOutput = actualToComparable(raw)

    return {
      testCaseId: testCase.id,
      input: testCase.input,
      expectedOutput: testCase.expectedOutput,
      actualOutput,
      passed: actualOutput === testCase.expectedOutput,
      timeMs: performance.now() - startTime,
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      testCaseId: testCase.id,
      input: testCase.input,
      expectedOutput: testCase.expectedOutput,
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
    async (code: string, testCases: TestCase[]): Promise<TestResult[]> => {
      const QuickJS = await initQuickJS()
      const list = testCases.filter((c) => c.enabled)
      const results: TestResult[] = []
      for (const testCase of list) {
        results.push(await evalMainCase(QuickJS, code, testCase))
      }
      return results
    },
    [initQuickJS],
  )

  const runCodeWithProgress = useCallback(
    async (
      code: string,
      testCases: TestCase[],
      onProgress: (done: number, total: number, last?: TestResult) => void,
    ): Promise<TestResult[]> => {
      const QuickJS = await initQuickJS()
      const list = testCases.filter((c) => c.enabled)
      const results: TestResult[] = []
      onProgress(0, list.length)
      for (let i = 0; i < list.length; i++) {
        const r = await evalMainCase(QuickJS, code, list[i])
        results.push(r)
        onProgress(i + 1, list.length, r)
      }
      return results
    },
    [initQuickJS],
  )

  const runCodeWithTimeout = useCallback(
    async (code: string, input: string): Promise<SandboxResult> => {
      const QuickJS = await initQuickJS()
      const startTime = performance.now()
      const vm = QuickJS.newContext()
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

        const call = vm.evalCode(
          `(function(){ const __r = main(${input}); return typeof __r === 'object' && __r !== null ? JSON.stringify(__r) : String(__r).trim(); })()`,
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
