import type { PlatformModel } from '@/types'

/** 命题「大模型辅助」默认选首个已启用的 deepseek；否则首个已启用模型 */
export function defaultAuthoringModelId(models: PlatformModel[]): string {
  const byProvider = models.find((m) => m.provider === 'deepseek' && m.enabled)
  if (byProvider) return byProvider.id
  return models.find((m) => m.enabled)?.id ?? models[0]?.id ?? ''
}
