import type { Client } from '@libsql/client'

export async function migrateDropModelsApiModelIfNeeded(client: Client): Promise<void> {
  try {
    const res = await client.execute({ sql: 'PRAGMA table_info(models)', args: [] })
    const has = res.rows.some(
      (row) => String((row as Record<string, unknown>).name) === 'api_model',
    )
    if (!has) return

    await client.execute({
      sql: `UPDATE models SET name = TRIM(api_model)
            WHERE TRIM(COALESCE(api_model,'')) != ''`,
      args: [],
    })
    await client.execute({
      sql: 'ALTER TABLE models DROP COLUMN api_model',
      args: [],
    })
    console.log('[db] migration: dropped models.api_model (merged into name)')
  } catch (e) {
    console.warn('[db] migration: models.api_model drop failed', e)
  }
}
