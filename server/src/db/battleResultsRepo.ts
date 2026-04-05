import type { Client } from '@libsql/client'

export async function upsertBattleResult(
  client: Client,
  input: {
    id: string
    problemId: string
    modelAId: string
    modelBId: string
    payloadJson: string
    createdBy: string
  },
): Promise<void> {
  const now = new Date().toISOString()
  await client.execute({
    sql: `INSERT INTO battle_results (
      id, problem_id, model_a_id, model_b_id, payload_json, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      problem_id = excluded.problem_id,
      model_a_id = excluded.model_a_id,
      model_b_id = excluded.model_b_id,
      payload_json = excluded.payload_json,
      created_by = excluded.created_by,
      created_at = excluded.created_at`,
    args: [
      input.id,
      input.problemId,
      input.modelAId,
      input.modelBId,
      input.payloadJson,
      input.createdBy,
      now,
    ],
  })
}
