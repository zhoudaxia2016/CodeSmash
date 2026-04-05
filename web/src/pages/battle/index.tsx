import { useState, useEffect, useLayoutEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import {
  useProblem,
  useStartBattle,
  useBattle,
  useUpdateProblem,
  useCreateTestCase,
  useUpdateTestCase,
  useDeleteTestCase,
} from '@/hooks/useApi'
import type { PlatformModel, Problem, ProblemGradingContext } from '@/types'
import { defaultAuthoringModelId } from '@/lib/authoring-model'
import { ProblemEditor, type ProblemEditorProps } from '@/components/problem-editor'
import { Result } from './result'
import { NewProblem } from './new-problem'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const HEADER_SLOT_ID = 'battle-header-slot'

export function Battle({ models, problems }: { models: PlatformModel[]; problems: Problem[] }) {
  const queryClient = useQueryClient()
  const [selectedProblem, setSelectedProblem] = useState('')
  const [problemDetailOpen, setProblemDetailOpen] = useState(false)
  const [modelA, setModelA] = useState('')
  const [modelB, setModelB] = useState('')
  const [battleId, setBattleId] = useState<string | null>(null)
  const [newProblemOpen, setNewProblemOpen] = useState(false)
  const { mutate: startBattle, isPending: battleStarting } = useStartBattle()
  const { data: battle, isLoading: battleLoading, isError: battleError } = useBattle(battleId || '')
  const problemForBattleQuery = useProblem(selectedProblem, {
    enabled: !!selectedProblem,
  })
  const problemDetailQuery = useProblem(selectedProblem, {
    enabled: !!selectedProblem && problemDetailOpen,
  })
  const updateProblem = useUpdateProblem()
  const createTc = useCreateTestCase()
  const updateTc = useUpdateTestCase()
  const deleteTc = useDeleteTestCase()

  const runTestCases = useMemo(() => {
    if (!selectedProblem || !problemForBattleQuery.isSuccess) return []
    return problemForBattleQuery.data?.testCases ?? []
  }, [problemForBattleQuery.isSuccess, problemForBattleQuery.data?.testCases, selectedProblem])
  const battleTestsReady = !!selectedProblem && problemForBattleQuery.isSuccess

  const gradingContext = useMemo((): ProblemGradingContext => {
    const p = problemForBattleQuery.data?.problem ?? problems.find((x) => x.id === selectedProblem)
    if (!p) {
      return { entryPoint: 'main', gradingMode: 'expected', verifySource: null }
    }
    return {
      entryPoint: p.entryPoint,
      gradingMode: p.gradingMode ?? 'expected',
      verifySource: p.verifySource ?? null,
    }
  }, [problemForBattleQuery.data?.problem, problems, selectedProblem])

  const selectedProblemRow = problems.find((p) => p.id === selectedProblem)

  const [headerSlotEl, setHeaderSlotEl] = useState<HTMLElement | null>(null)

  useLayoutEffect(() => {
    setHeaderSlotEl(document.getElementById(HEADER_SLOT_ID))
  }, [])

  useEffect(() => {
    if (problems.length > 0 && !selectedProblem) {
      setSelectedProblem(problems[0].id)
    }
  }, [problems, selectedProblem])

  useEffect(() => {
    setProblemDetailOpen(false)
  }, [selectedProblem])

  useEffect(() => {
    if (models.length > 0) {
      if (!modelA) setModelA(models[0].id)
      if (!modelB) setModelB(models[1]?.id || models[0].id)
    }
  }, [models, modelA, modelB])

  const handleProblemDetailConfirm = async (
    args: Parameters<NonNullable<ProblemEditorProps['onConfirm']>>[0],
  ) => {
    if (args.kind !== 'update') return
    const pid = args.problemId
    await updateProblem.mutateAsync({ id: pid, data: args.problem })
    for (const id of args.testCaseDeletes) {
      await deleteTc.mutateAsync({ problemId: pid, testCaseId: id })
    }
    for (const u of args.testCaseUpdates) {
      await updateTc.mutateAsync({
        problemId: pid,
        testCaseId: u.testCaseId,
        data: { data: u.data, ans: u.ans },
      })
    }
    for (const c of args.testCaseCreates) {
      await createTc.mutateAsync({
        problemId: pid,
        data: {
          data: c.data,
          ans: c.ans,
          input: JSON.stringify(c.data),
          expectedOutput: c.ans !== undefined ? JSON.stringify(c.ans) : '',
        },
      })
    }
    await queryClient.invalidateQueries({ queryKey: ['problems', pid] })
    await queryClient.invalidateQueries({ queryKey: ['problems'] })
  }

  const canStart = selectedProblem && modelA && modelB
  const modelAName = models.find((m) => m.id === modelA)?.name || 'Model A'
  const modelBName = models.find((m) => m.id === modelB)?.name || 'Model B'

  const handleStartBattle = () => {
    if (!canStart) return
    if (battleId) {
      queryClient.removeQueries({ queryKey: ['battles', battleId] })
    }
    setBattleId(null)
    startBattle(
      { problemId: selectedProblem, modelAId: modelA, modelBId: modelB },
      {
        onSuccess: (battleSession) => {
          setBattleId(battleSession.id)
        },
      },
    )
  }

  const headerControls = (
    <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <Select value={selectedProblem} onValueChange={setSelectedProblem}>
          <SelectTrigger
            className="h-9 min-w-[10rem] max-w-[20rem] flex-1 sm:flex-none sm:max-w-[18rem]"
            aria-label="选择题目"
          >
            <SelectValue placeholder="题目…" />
          </SelectTrigger>
          <SelectContent>
            {problems.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={modelA} onValueChange={setModelA}>
          <SelectTrigger
            className="h-9 w-full min-w-[8rem] sm:w-[11rem]"
            aria-label="模型 A"
          >
            <SelectValue placeholder="Model A" />
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={modelB} onValueChange={setModelB}>
          <SelectTrigger
            className="h-9 w-full min-w-[8rem] sm:w-[11rem]"
            aria-label="模型 B"
          >
            <SelectValue placeholder="Model B" />
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5"
          disabled={!selectedProblemRow}
          aria-expanded={problemDetailOpen}
          onClick={() => setProblemDetailOpen((o) => !o)}
        >
          题目详情
          <ChevronDown
            className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${problemDetailOpen ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="shrink-0"
          disabled={models.length === 0}
          title={models.length === 0 ? '需至少一个可用模型以使用命题辅助' : undefined}
          onClick={() => setNewProblemOpen(true)}
        >
          新建题目
        </Button>
      </div>
      <Button
        type="button"
        disabled={!canStart || battleStarting}
        onClick={handleStartBattle}
        className="h-9 shrink-0"
      >
        {battleStarting ? '创建中…' : '开始对战'}
      </Button>
    </div>
  )

  const detailLoading =
    problemDetailOpen && !!selectedProblem && problemDetailQuery.isLoading && !problemDetailQuery.data
  const detailFailed =
    problemDetailOpen && !!selectedProblem && problemDetailQuery.isError && !problemDetailQuery.data

  return (
    <div className="space-y-6">
      {headerSlotEl ? createPortal(headerControls, headerSlotEl) : null}

      <Result
        battle={battle}
        battleId={battleId}
        battleLoading={!!battleId && battleLoading}
        battleError={!!battleId && battleError}
        starting={battleStarting}
        selectedProblemId={selectedProblem}
        modelAName={modelAName}
        modelBName={modelBName}
        runTestCases={runTestCases}
        battleTestsReady={battleTestsReady}
        grading={gradingContext}
      />

      <NewProblem
        open={newProblemOpen}
        onOpenChange={setNewProblemOpen}
        models={models}
        defaultModelId={defaultAuthoringModelId(models)}
        onCreated={(id) => {
          setSelectedProblem(id)
          setNewProblemOpen(false)
          void queryClient.invalidateQueries({ queryKey: ['problems'] })
          void queryClient.invalidateQueries({ queryKey: ['problems', id] })
        }}
      />

      {problemDetailOpen && selectedProblemRow && (
        <ProblemEditor
          open={problemDetailOpen}
          onOpenChange={setProblemDetailOpen}
          title="题目详情"
          titleId="battle-problem-detail-title"
          mode="edit"
          problemId={selectedProblem}
          detail={problemDetailQuery.data ?? null}
          loading={detailLoading}
          loadFailed={detailFailed}
          problemSummary={selectedProblemRow}
          models={models}
          defaultModelId={defaultAuthoringModelId(models)}
          onConfirm={handleProblemDetailConfirm}
          submitLabel="保存全部"
        />
      )}
    </div>
  )
}
