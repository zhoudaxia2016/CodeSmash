import type { GradingMode } from '@/types'

/** 表单里「一条用例」的两段 JSON 字符串（输入参数数组 + 可选标准答案）。 */
export type TestCaseRow = { data: string; ans: string }

/**
 * 将用例行解析为提交 API 所需的 `data` 列表；expected 模式下同时解析与用例对齐的 `answers`。
 */
export function parseRowsToTestCases(
  rows: TestCaseRow[],
  mode: GradingMode,
): { data: unknown[][]; answers: unknown[] | null } {
  const data: unknown[][] = []
  const answers: unknown[] = []
  for (let i = 0; i < rows.length; i++) {
    const ds = rows[i].data.trim()
    const as = rows[i].ans.trim()
    if (!ds && !as) continue
    if (!ds) {
      throw new Error(`用例 ${i + 1}：已填写标准答案但缺少测试输入`)
    }
    try {
      const v = JSON.parse(ds) as unknown
      if (!Array.isArray(v)) {
        throw new Error(`用例 ${i + 1}：测试输入须为 JSON 数组（按函数参数顺序）`)
      }
      data.push(v)
    } catch (e) {
      if (e instanceof SyntaxError) {
        throw new Error(`用例 ${i + 1}：测试输入 JSON 无法解析`)
      }
      throw e
    }
    if (mode === 'expected') {
      if (!as) {
        throw new Error(`用例 ${i + 1}：标准答案模式须填写该条的标准答案（单行 JSON）`)
      }
      try {
        answers.push(JSON.parse(as) as unknown)
      } catch {
        throw new Error(`用例 ${i + 1}：标准答案 JSON 无法解析`)
      }
    }
  }
  return { data, answers: mode === 'expected' ? answers : null }
}
