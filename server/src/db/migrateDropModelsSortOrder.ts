import type { Client } from '@libsql/client'

export async function migrateDropModelsSortOrderIfNeeded(client: Client): Promise<void> {
  try {
    const res = await client.execute({ sql: 'PRAGMA table_info(models)', args: [] })
    const has = res.rows.some(
      (row) => String((row as Record<string, unknown>).name) === 'sort_order',
    )
    if (!has) return
    await client.execute({ sql: 'ALTER TABLE models DROP COLUMN sort_order', args: [] })
    console.log('[db] migration: dropped models.sort_order')
  } catch (e) {
    console.warn('[db] migration: models.sort_order drop failed', e)
  }
}
