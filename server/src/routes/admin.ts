import { Hono } from 'hono'
import type { SessionUser } from '../db/userSessionsRepo.ts'
import { requireAdmin } from '../middleware/requireAdmin.ts'

const adminRouter = new Hono<{ Variables: { user?: SessionUser } }>()

adminRouter.use('*', requireAdmin)

adminRouter.get('/models', (c) => {
  return c.json({
    message: '模型管理（占位）',
    items: [] as unknown[],
  })
})

adminRouter.get('/logs', (c) => {
  return c.json({
    message: '日志管理（占位）',
    items: [] as unknown[],
  })
})

export { adminRouter }
