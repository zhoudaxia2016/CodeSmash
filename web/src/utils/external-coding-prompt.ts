import type { GradingMode } from '@/types'

/** DeepSeek 对话页；剪贴板需用户在页内粘贴。 */
export const DEEPSEEK_CHAT_URL = 'https://chat.deepseek.com/'

type TestCaseRowInput = {
  data: string
  deleted?: boolean
}

export type ExternalCodingPromptFields = {
  title: string
  description: string
  tags: string[]
  entryPoint: string
  functionSignature: string
  gradingMode: GradingMode
  verifySource: string
  rows: TestCaseRowInput[]
}

/**
 * 组装发给外部大模型（如 DeepSeek）的题面：含描述、签名与测试输入，**不含**标准答案字段。
 */
export function buildExternalCodingPrompt(fields: ExternalCodingPromptFields): string {
  const {
    title,
    description,
    tags,
    entryPoint,
    functionSignature,
    gradingMode,
    verifySource,
    rows,
  } = fields

  const lines: string[] = [
    '下面是一道编程题的题面与公开测试输入。测试输入为 JSON 数组，表示按顺序传给入口函数的参数列表。',
    '请根据题意给出思路与能通过下列用例的实现代码。',
    '（下列内容刻意不包含标准答案 / 期望输出。）',
    '',
    `## 标题`,
    title.trim() || '（无标题）',
    '',
    `## 描述`,
    description.trim() || '（无描述）',
    '',
  ]

  if (tags.length > 0) {
    lines.push(`## 标签`, tags.join(', '), '')
  }

  lines.push(
    `## 入口`,
    entryPoint.trim() || '（未指定）',
    '',
    `## 函数签名`,
    functionSignature.trim() || '（未指定）',
    '',
  )

  if (gradingMode === 'verify') {
    lines.push(`## 评测方式`, '自定义校验（verify）', '')
    const vs = verifySource.trim()
    if (vs) {
      lines.push('### 校验代码', '```', vs, '```', '')
    }
  } else {
    lines.push(`## 评测方式`, '标准输出比对（expected）；下列用例仅含输入。', '')
  }

  const inputs = rows
    .filter((r) => !r.deleted)
    .map((r) => r.data.trim())
    .filter(Boolean)

  lines.push(`## 测试用例（仅输入）`)
  if (inputs.length === 0) {
    lines.push('（暂无）')
  } else {
    inputs.forEach((data, i) => {
      lines.push(`### 用例 ${i + 1}`, '```json', data, '```', '')
    })
  }

  return lines.join('\n')
}
