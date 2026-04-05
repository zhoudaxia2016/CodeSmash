import { useCallback, useEffect, useState } from 'react'
import { useSuggestProblemAuthoring } from '@/hooks/useApi'
import type { ProblemAuthoringResponse } from '@/types'
import { parseRowsToTestCases, type TestCaseRow } from '@/utils/test-case-rows'

/**
 * 命题「大模型辅助」：调用 `/problems/authoring`，与具体表单 UI 解耦。
 * 配套 UI 可用 `components/create-problem/problem-authoring-assist-panel`；也可在其它页面自行接线。
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
      setError: (msg: string | null) => void
      setLlmNote: (msg: string | null) => void
      onSuccess: (data: ProblemAuthoringResponse) => void
    }) => {
      input.setError(null)
      input.setLlmNote(null)
      let testCasesData: unknown[][]
      try {
        testCasesData = parseRowsToTestCases(input.testCaseRows, 'verify').data
      } catch (e) {
        input.setError(e instanceof Error ? e.message : '解析失败')
        return
      }
      if (!input.description.trim() && !input.title.trim()) {
        input.setError('请先填写题目描述（或标题），再使用大模型辅助')
        return
      }
      suggest.mutate(
        {
          title: input.title.trim() || undefined,
          description: input.description.trim() || undefined,
          functionSignature: input.functionSignature.trim() || undefined,
          testCasesData,
          tags: input.tags,
          modelId: authorModelId,
        },
        {
          onSuccess: (data) => {
            const baseNote =
              data.reasoning?.trim() || '已根据模型输出更新表单，请人工核对后再保存。'
            input.onSuccess(data)
            input.setLlmNote(baseNote)
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
