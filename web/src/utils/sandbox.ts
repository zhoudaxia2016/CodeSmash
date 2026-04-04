import { useCallback, useRef } from 'react'
import variant from '@jitl/quickjs-ng-wasmfile-release-sync'
import { type SandboxOptions, loadQuickJs } from '@sebastianwessel/quickjs'
import type { TestCase, TestResult } from '../types'

const EXECUTION_TIMEOUT_MS = 5000

interface SandboxResult {
  output: string
  error?: string
  timeMs: number
}

type QuickJSRuntime = Awaited<ReturnType<typeof loadQuickJs>>

export function useSandbox() {
  const runtimeRef = useRef<QuickJSRuntime | null>(null)

  const initSandbox = useCallback(async () => {
    if (!runtimeRef.current) {
      runtimeRef.current = await loadQuickJs(variant)
    }
    return runtimeRef.current
  }, [])

  const runCode = useCallback(async (code: string, testCases: TestCase[]): Promise<TestResult[]> => {
    const runtime = await initSandbox()
    const { runSandboxed } = runtime
    const results: TestResult[] = []

    const options: SandboxOptions = {
      executionTimeout: EXECUTION_TIMEOUT_MS,
    }

    for (const testCase of testCases) {
      const startTime = performance.now()
      try {
        const wrappedCode = `
${code}
return main(${testCase.input});
`
        const result = await runSandboxed(
          async ({ evalCode }) => evalCode(wrappedCode),
          options
        ) as { ok: boolean; data?: unknown }

        const timeMs = performance.now() - startTime
        const actualOutput = result.ok && result.data !== undefined
          ? String(result.data).trim()
          : ''

        results.push({
          testCaseId: testCase.id,
          input: testCase.input,
          expectedOutput: testCase.expectedOutput,
          actualOutput,
          passed: actualOutput === testCase.expectedOutput,
          timeMs,
        })
      } catch (e: any) {
        const timeMs = performance.now() - startTime
        results.push({
          testCaseId: testCase.id,
          input: testCase.input,
          expectedOutput: testCase.expectedOutput,
          actualOutput: '',
          passed: false,
          timeMs,
        })
      }
    }

    return results
  }, [initSandbox])

  const runCodeWithTimeout = useCallback(async (code: string, input: string): Promise<SandboxResult> => {
    const runtime = await initSandbox()
    const { runSandboxed } = runtime
    const startTime = performance.now()

    const options: SandboxOptions = {
      executionTimeout: EXECUTION_TIMEOUT_MS,
    }

    try {
      const wrappedCode = `
${code}
return main(${input});
`
      const result = await runSandboxed(
        async ({ evalCode }) => evalCode(wrappedCode),
        options
      ) as { ok: boolean; data?: unknown }

      const timeMs = performance.now() - startTime
      const output = result.ok && result.data !== undefined
        ? String(result.data).trim()
        : ''

      return { output, timeMs }
    } catch (e: any) {
      return {
        output: '',
        error: e.message || 'Execution failed',
        timeMs: performance.now() - startTime,
      }
    }
  }, [initSandbox])

  return {
    runCode,
    runCodeWithTimeout,
    initSandbox,
  }
}