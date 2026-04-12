import { useCallback, useEffect, useState } from 'react'
import { useSuggestProblemAuthoring } from '@/hooks/useApi'
import type { GradingMode, ProblemAuthoringResponse } from '@/types'
import { parseRowsToTestCases, type TestCaseRow } from '../lib/test-case-rows'

/**
 * 命题「大模型辅助」：调用 `/problems/authoring`，与具体表单 UI 解耦。
 * 配套 UI 见 `components/problem-editor/authoring-assist-panel`（由 `ProblemEditor` 组合）；也可在其它页面自行接线。
 */
export function useProblemAuthoringAssist(defaultModelId: string) {
  const [authorModelId, setAuthorModelId] = useState(defaultModelId)
  const suggest = useSuggestProblemAuthoring()

  useEffect(() => {
    if (defaultModelId) setAuthorModelId(defaultModelId)
  }, [defaultModelId])

  const requestSuggest = useCallback(
    (input: {
      title: string
      description: string
      functionSignature: string
      tags: string[]
      testCaseRows: TestCaseRow[]
      gradingMode: GradingMode
      /** 勾选「辅助与表单判题一致」时为 true。 */
      assistGradingFromForm: boolean
      /** 生成模式：create（生成新用例）、append（追加用例）、fix（修正答案）。 */
      authoringMode: 'create' | 'append' | 'fix'
      /** 目标用例数（create/append 模式需要）。 */
      targetCount: number
      /** 现有用例数（append 模式需要）。 */
      existingCount: number
      setError: (msg: string | null) => void
      onSuccess: (data: ProblemAuthoringResponse) => void
    }) => {
      input.setError(null)
      
      if (!input.description.trim() && !input.title.trim()) {
        input.setError('请先填写题目描述（或标题），再使用大模型辅助')
        return
      }

      if (input.authoringMode === 'fix' && input.gradingMode !== 'expected') {
        input.setError('修正答案模式仅支持标准答案模式')
        return
      }

      let testCasesData: Array<{ data: unknown[] }> | undefined
      if (input.authoringMode !== 'create') {
        try {
          const parsed = parseRowsToTestCases(input.testCaseRows, input.gradingMode)
          testCasesData = parsed.data.map(d => ({ data: d }))
        } catch (e) {
          input.setError(e instanceof Error ? e.message : '解析失败')
          return
        }
      }

      suggest.mutate(
        {
          title: input.title.trim() || undefined,
          description: input.description.trim() || undefined,
          functionSignature: input.functionSignature.trim() || undefined,
          testCasesData,
          tags: input.tags,
          modelId: authorModelId,
          formGradingMode: input.gradingMode,
          assistGradingFromForm: input.assistGradingFromForm,
          authoringMode: input.authoringMode,
          targetCount: input.authoringMode !== 'fix' ? input.targetCount : undefined,
          existingCount: input.authoringMode === 'append' ? input.existingCount : undefined,
        },
        {
          onSuccess: (data) => {
            input.onSuccess(data)
          },
          onError: (e) => {
            const msg = e instanceof Error ? e.message : 'LLM 调用失败'
            input.setError(`${msg}（可检查网络、API 配置，或换一个「辅助模型」再试。）`)
          },
        },
      )
    },
    [suggest, authorModelId],
  )

  return {
    authorModelId,
    setAuthorModelId,
    suggestPending: suggest.isPending,
    requestSuggest,
  }
}
