import type { Client } from '@libsql/client'

export async function migrateDropModelsDescriptionIfNeeded(client: Client): Promise<void> {
  try {
    const res = await client.execute({ sql: 'PRAGMA table_info(models)', args: [] })
    const has = res.rows.some(
      (row) => String((row as Record<string, unknown>).name) === 'description',
    )
    if (!has) return
    await client.execute({ sql: 'ALTER TABLE models DROP COLUMN description', args: [] })
    console.log('[db] migration: dropped models.description')
  } catch (e) {
    console.warn('[db] migration: models.description drop failed', e)
  }
}
