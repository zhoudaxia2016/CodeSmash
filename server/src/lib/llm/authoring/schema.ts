import { z } from 'zod'
import type { AuthoringMode } from './types.ts'

export type BuildAuthoringResponseSchemaInput = {
  title: string,
  entryPoint: string,
  functionSignature: string,
  authoringMode: AuthoringMode
  lockVerifySource: boolean
  verifySource: string
}

type AuthoringFieldPresence = 'omit' | 'optional' | 'required'

type AuthoringSchemaFieldConfig = {
  key: string,
  type: z.ZodTypeAny
  presence: (input: BuildAuthoringResponseSchemaInput) => AuthoringFieldPresence
}

const authoringResponseTestCaseSchema = z.object({
  data: z.array(z.unknown()).describe('函数输入参数数组，按 functionSignature 中的参数顺序排列；例如 [1, 2] 表示第一个参数为 1，第二个参数为 2。'),
  ans: z.unknown().optional().describe('传给 verifySource 的参考答案或校验所需参考值；必须是可被 JSON 表达的值。'),
})

const AUTHORING_RESPONSE_SCHEMA_FIELDS: AuthoringSchemaFieldConfig[] = [
  {
    key: 'title',
    type: z.string().trim().min(1).describe('题目标题'),
    presence: ({title}) => title ? 'optional' : 'required',
  },
  {
    key: 'functionSignature',
    type: z.string().trim().min(1).describe('函数签名字符串，例如 function twoSum(nums, target)。'),
    presence: ({ authoringMode, lockVerifySource, functionSignature }) => {
      if (authoringMode === 'append' || lockVerifySource) return 'omit'
      return functionSignature ? 'optional' : 'required'
    }
  },
  {
    key: 'entryPoint',
    type: z.string().trim().min(1).describe('用户代码需要实现的入口函数名，需要与 functionSignature 保持一致。'),
    presence: ({ authoringMode, lockVerifySource, entryPoint }) => {
      if (authoringMode === 'append' || lockVerifySource) return 'omit'
      return entryPoint ? 'optional' : 'required'
    }
  },
  {
    key: 'testCases',
    type: z.array(authoringResponseTestCaseSchema).describe('测试用例数组。'),
    presence: () => 'required',
  },
  {
    key: 'verifySource',
    type: z.string().trim().min(1).describe(`
一段可运行的 JavaScript，必须定义 function verifySource(args, ans, candidate) { return ans === candidate; }。
args和ans是testCases[number]里的字段，candidate是functionSignature的返回值。
即使是定值题也必须提供，并在函数中自行比较 candidate 与 ans。
不要实现一个解题函数，这是题目验证器。
验证器主要有三种类型：
- 对答案模式。判断和答案是否相等。答案列举应该要详尽。
- 纯验证模式。无答案，比如走迷宫问题，只要验证路径能走到终点即可。
- 答案+验证模式。比如最短路径问题，需要验证路径长度为某个数（也就是ans），并且要验证路径能到达终点。
`.trim()),
    presence: ({ authoringMode, lockVerifySource, verifySource }) => {
      if (authoringMode === 'append' || lockVerifySource) return 'omit'
      return verifySource ? 'optional' : 'required'
    },
  },
  {
    key: 'reasoning',
    type: z.string().describe('简要说明本次生成或补全测试用例的思路，包括覆盖到的边界情况，verifySource模式。若是对答案模式，需要确认答案是否详尽'),
    presence: () => 'required',
  },
]

const authoringSchemaCache = new Map<string, {
  schema: z.ZodObject<Record<string, z.ZodTypeAny>>
  schemaText: string
}>()

function authoringSchemaCacheKey(input: BuildAuthoringResponseSchemaInput): string {
  return JSON.stringify({
    authoringMode: input.authoringMode,
    lockVerifySource: input.lockVerifySource,
    verifySource: input.verifySource.trim(),
  })
}

export function getAuthoringResponseSchema(input: BuildAuthoringResponseSchemaInput) {
  const key = authoringSchemaCacheKey(input)
  const cached = authoringSchemaCache.get(key)
  if (cached) return cached

  const shapeEntries = AUTHORING_RESPONSE_SCHEMA_FIELDS.flatMap((field) => {
    const presence = field.presence(input)
    if (presence === 'omit') return []
    return [[field.key, presence === 'required' ? field.type : field.type.optional()]] as const
  })

  const shape = Object.fromEntries(shapeEntries) as Record<string, z.ZodTypeAny>
  const schema = z.object(shape).strict()
  const built = {
    schema,
    schemaText: JSON.stringify(z.toJSONSchema(schema), null, 2),
  }
  authoringSchemaCache.set(key, built)
  return built
}
