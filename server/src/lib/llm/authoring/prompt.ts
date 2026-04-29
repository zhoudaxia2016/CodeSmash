import { getAuthoringResponseSchema } from './schema.ts'
import type { AuthoringMode, ProblemAuthoringInput } from './types.ts'

function complete_or_create_text(entryPoint: string, functionSignature: string, verifySource: string, lockVerifySource: boolean) {
  return [
    { key: 'entryPoint', value: entryPoint },
    { key: 'functionSignature', value: functionSignature },
    { key: 'verifySource', value: verifySource },
  ].map(_ => '- ' + (lockVerifySource
    ? `保持现有${_.key}不变`
    : _.value ? `如有必要，可以修正${_.key}` : `生成${_.key}`))
    .join('\n')
}

function buildCreatingTask(entryPoint: string, functionSignature: string, verifySource: string, targetCount: number, lockVerifySource: boolean) {
  return `
## 任务

你需要：
- 补全标题（如果缺失）
${complete_or_create_text(entryPoint, functionSignature, verifySource, lockVerifySource)}
- 生成 ${targetCount} 条测试用例
- 为每条测试用例生成对应 ans
`.trim()
}

function buildAppendingTask(targetCount: number, existingCount: number) {
  return `
## 任务

在现有 ${existingCount} 条测试用例基础上补充 ${targetCount} 条新的测试用例。

你需要：
- 生成新的测试用例
- 为每条新测试用例生成对应 ans。

要求：
- 只返回新增的测试用例
- 新测试用例的 data 不能与现有用例重复
- 新测试用例必须与现有题意、函数签名、入口函数名和 verifySource 保持一致。
`.trim()
}

function buildFixingTask(entryPoint: string, functionSignature: string, verifySource: string, lockVerifySource: boolean) {
  return `
## 任务

检查现有测试用例是否与题意一致，并修正每条测试用例对应的 ans。
你需要：
- 保持现有每条测试用例的 data 不变
- 重新生成每条测试用例对应的 ans
${complete_or_create_text(entryPoint, functionSignature, verifySource, lockVerifySource)}
要求：
- 不要新增测试用例
- 不要删除测试用例
- 不要改写任何一条测试用例的 data
`.trim()
}

function buildAuthoringSystemContent(input: {
  title: string,
  entryPoint: string,
  functionSignature: string,
  authoringMode: AuthoringMode
  lockVerifySource: boolean
  verifySource: string
  targetCount: number
  existingCount: number
}): string {
  const { title, entryPoint, functionSignature, authoringMode, verifySource, targetCount, existingCount, lockVerifySource } = input
  const { schemaText } = getAuthoringResponseSchema({
    title, entryPoint, functionSignature,
    authoringMode,
    lockVerifySource,
    verifySource,
  })

  let taskSection = ''
  if (authoringMode === 'create') {
    taskSection = buildCreatingTask(entryPoint, functionSignature, verifySource, targetCount, lockVerifySource)
  } else if (authoringMode === 'append') {
    taskSection = buildAppendingTask(targetCount, existingCount)
  } else {
    taskSection = buildFixingTask(entryPoint, functionSignature, verifySource, lockVerifySource)
  }

  const outputSection = `## 输出格式

严格返回一个 JSON 对象，不要输出 Markdown 代码块，不要输出额外解释。

按以下 JSON Schema 对应的 JSON 结构返回，禁止额外字段：

\`\`\`json
${schemaText}
\`\`\``

  return `你是竞赛编程题库助手。根据用户题目配置 JSON 生成或者补全题目配置。

${taskSection}

${outputSection}`
}

export function buildProblemAuthoringMessages(input: ProblemAuthoringInput) {
  const {
    title = '', description = '', entryPoint = '',
    functionSignature = '', verifySource = '', testCases = [],
    authoringMode = 'append', lockVerifySource = false, targetCount = 5, existingCount = 0,
  } = input

  const userPayload = {
    title,
    description,
    entryPoint,
    functionSignature,
    verifySource,
    testCases: testCases.map((tc) => ({
      data: tc.data,
      ...(tc.ans !== undefined ? { ans: tc.ans } : {}),
    })),
  }

  if (Array.isArray(input.testCases) && input.testCases.length > 0) {
    userPayload.testCases = (input.testCases ?? []).map((tc) => ({
      data: tc.data,
      ...(tc.ans !== undefined ? { ans: tc.ans } : {}),
    }))
  }

  const userContent = `输入JSON：

\`\`\`json
${JSON.stringify(userPayload, null, 2)}
\`\`\``

  return {
    systemContent: buildAuthoringSystemContent({
      title,
      entryPoint,
      functionSignature,
      authoringMode,
      lockVerifySource,
      verifySource,
      targetCount,
      existingCount,
    }),
    userContent,
  }
}
