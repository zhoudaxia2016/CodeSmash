import type { PlatformModel } from '@/types'

/** 与 `server` 平台模型列表中的 DeepSeek 条目 id 对齐 */
export const DEFAULT_AUTHORING_MODEL_ID = 'deepseek-v3'

/** 命题「大模型辅助」下拉默认选 DeepSeek；缺失时退化为首个 deepseek 系或列表首项 */
export function defaultAuthoringModelId(models: PlatformModel[]): string {
  const byId = models.find((m) => m.id === DEFAULT_AUTHORING_MODEL_ID && m.enabled)
  if (byId) return byId.id
  const byProvider = models.find((m) => m.provider === 'deepseek' && m.enabled)
  if (byProvider) return byProvider.id
  return models.find((m) => m.enabled)?.id ?? models[0]?.id ?? ''
}
