import { Hono } from 'hono'
import { officialTestCasesByProblem } from '../data/problemTestCases.ts'

const problemsRouter = new Hono()

export type Problem = {
  id: string
  title: string
  description: string
  difficulty: 'easy' | 'medium' | 'hard'
  tags: string[]
  entryPoint: string
  functionSignature: string
  createdAt: string
  updatedAt: string
}

export const problems: Problem[] = [
  {
    id: '1',
    title: '两数之和',
    description: '给定一个整数数组 nums 和一个整数 target，返回数组中和为目标值的两个数的索引。',
    difficulty: 'easy',
    tags: ['数组', '哈希表'],
    entryPoint: 'main',
    functionSignature: 'function main(nums: number[], target: number): number[]',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: '2',
    title: '回文数',
    description: '判断一个整数是否是回文数。回文数是指正序和倒序读都一样的整数。',
    difficulty: 'easy',
    tags: ['数学', '字符串'],
    entryPoint: 'main',
    functionSignature: 'function main(x: number): boolean',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
]

problemsRouter.get('/', (c) => {
  return c.json({ problems })
})

problemsRouter.get('/:id', (c) => {
  const id = c.req.param('id')
  const problem = problems.find((p) => p.id === id)
  if (!problem) {
    return c.json({ error: 'Problem not found' }, 404)
  }
  const testCases = officialTestCasesByProblem[id] ?? []
  return c.json({ problem, testCases })
})

problemsRouter.post('/', async (c) => {
  const body = await c.req.json()
  const newProblem: Problem = {
    id: String(problems.length + 1),
    ...body,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  problems.push(newProblem)
  return c.json({ problem: newProblem }, 201)
})

problemsRouter.patch('/:id', async (c) => {
  const id = c.req.param('id')
  const index = problems.findIndex((p) => p.id === id)
  if (index === -1) {
    return c.json({ error: 'Problem not found' }, 404)
  }
  const updates = await c.req.json()
  problems[index] = { ...problems[index], ...updates, updatedAt: new Date().toISOString() }
  return c.json({ problem: problems[index] })
})

problemsRouter.delete('/:id', (c) => {
  const id = c.req.param('id')
  const index = problems.findIndex((p) => p.id === id)
  if (index === -1) {
    return c.json({ error: 'Problem not found' }, 404)
  }
  problems.splice(index, 1)
  return c.json({ success: true })
})

export { problemsRouter }