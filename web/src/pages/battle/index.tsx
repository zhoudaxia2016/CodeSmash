import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useMe, useProblem, useStartBattle, useBattle } from '@/hooks/useApi'
import { usePersistProblemEditorUpdate } from '@/hooks/usePersistProblemEditorUpdate'
import type { PlatformModel, Problem, ProblemGradingContext } from '@/types'
import { removeLocalBattleEntry, saveBattleToLocalHistory } from '@/utils/battle-local-history'
import { loadBattleSyncPrefs } from '@/utils/battle-sync-prefs'
import { defaultAuthoringModelId } from '@/lib/authoring-model'
import { ProblemEditor, type ProblemEditorProps } from '@/components/problem-editor'
import { Result } from './result'
import { BattleReadonlyDetail } from './replay-panel'
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

export function Battle({
  models,
  problems,
  openBattleDetailId,
  onClearOpenBattleDetail,
}: {
  models: PlatformModel[]
  problems: Problem[]
  openBattleDetailId: string | null
  onClearOpenBattleDetail: () => void
}) {
  const queryClient = useQueryClient()
  const { data: meData } = useMe()
  const currentUser = meData?.user ?? null
  const [selectedProblem, setSelectedProblem] = useState('')
  const [problemDetailOpen, setProblemDetailOpen] = useState(false)
  const [modelA, setModelA] = useState('')
  const [modelB, setModelB] = useState('')
  const [battleId, setBattleId] = useState<string | null>(null)
  const [newProblemOpen, setNewProblemOpen] = useState(false)
  const [readonlyDetailId, setReadonlyDetailId] = useState<string | null>(null)
  const [openingDetailId, setOpeningDetailId] = useState<string | null>(null)
  const [terminalPersist, setTerminalPersist] = useState<'local' | 'cloud' | 'cloud_error' | null>(null)
  const uploadedTerminalRef = useRef<string | null>(null)
  /** 从云端恢复进内存的对战：只更新云端，不写本地历史（避免「本地+云端」重复）。 */
  const cloudBackedBattleRef = useRef(false)

  const { mutate: startBattle, isPending: battleStarting } = useStartBattle()
  const { data: battle, isLoading: battleLoading, isError: battleError } = useBattle(battleId || '')
  const problemForBattleQuery = useProblem(selectedProblem, {
    enabled: !!selectedProblem,
  })
  const problemDetailQuery = useProblem(selectedProblem, {
    enabled: !!selectedProblem && problemDetailOpen,
  })
  const persistProblemEditorUpdate = usePersistProblemEditorUpdate()

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

  const problemTagCatalog = useMemo(() => {
    const s = new Set<string>()
    for (const p of problems) {
      for (const t of p.tags ?? []) s.add(t)
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [problems])

  const selectableModels = useMemo(() => models.filter((m) => m.enabled), [models])

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
    uploadedTerminalRef.current = null
    setTerminalPersist(null)
  }, [battleId])

  useEffect(() => {
    if (!battle || !battleId || battle.id !== battleId) return
    if (battle.status !== 'completed' && battle.status !== 'failed') {
      uploadedTerminalRef.current = null
    }
  }, [battle?.status, battle?.id, battleId])

  useEffect(() => {
    if (!battle || !battleId || battle.id !== battleId) return
    if (battle.status !== 'completed' && battle.status !== 'failed') return
    if (uploadedTerminalRef.current === battle.id) return

    const bid = battle.id
    let cancelled = false
    const auto = loadBattleSyncPrefs().autoSyncWhenLoggedIn
    const isCloudBacked = cloudBackedBattleRef.current
    const shouldPostCloud = !!currentUser && (auto || isCloudBacked)

    if (shouldPostCloud && currentUser) {
      const user = currentUser
      void (async () => {
        try {
          await api.postBattleResult(battle)
          if (cancelled) return
          uploadedTerminalRef.current = bid
          void queryClient.invalidateQueries({ queryKey: ['battle-results'] })
          setTerminalPersist('cloud')
        } catch {
          if (cancelled) return
          if (isCloudBacked) {
            uploadedTerminalRef.current = bid
            setTerminalPersist('cloud_error')
          } else {
            saveBattleToLocalHistory(battle, user)
            uploadedTerminalRef.current = bid
            setTerminalPersist('local')
          }
        }
      })()
    } else if (!isCloudBacked) {
      saveBattleToLocalHistory(battle, currentUser)
      uploadedTerminalRef.current = bid
      setTerminalPersist('local')
    } else {
      uploadedTerminalRef.current = bid
      setTerminalPersist(null)
    }

    return () => {
      cancelled = true
    }
  }, [battle, battleId, currentUser, queryClient])

  useEffect(() => {
    if (!openBattleDetailId) return
    const id = openBattleDetailId
    setOpeningDetailId(id)
    let cancelled = false

    void (async () => {
      if (currentUser) {
        try {
          await api.resumeBattle(id)
          if (cancelled) return
          cloudBackedBattleRef.current = true
          removeLocalBattleEntry(id)
          void queryClient.invalidateQueries({ queryKey: ['battles', id] })
          setBattleId(id)
          setReadonlyDetailId(null)
          setOpeningDetailId(null)
          return
        } catch {
          /* 仅本地或未上云：只读详情 */
        }
      }
      if (!cancelled) {
        setReadonlyDetailId(id)
      }
      setOpeningDetailId(null)
    })()

    return () => {
      cancelled = true
    }
  }, [openBattleDetailId, currentUser?.id, queryClient])

  useEffect(() => {
    if (selectableModels.length === 0) return
    if (!modelA || !selectableModels.some((m) => m.id === modelA)) {
      setModelA(selectableModels[0].id)
    }
  }, [selectableModels, modelA])

  useEffect(() => {
    if (selectableModels.length === 0) return
    const a = modelA || selectableModels[0].id
    if (!modelB || !selectableModels.some((m) => m.id === modelB) || modelB === a) {
      const alt = selectableModels.find((m) => m.id !== a)
      setModelB(alt?.id ?? selectableModels[0].id)
    }
  }, [selectableModels, modelB, modelA])

  const canStart =
    !!selectedProblem &&
    !!modelA &&
    !!modelB &&
    modelA !== modelB &&
    selectableModels.some((m) => m.id === modelA) &&
    selectableModels.some((m) => m.id === modelB)
  const modelAName = models.find((m) => m.id === modelA)?.name || 'Model A'
  const modelBName = models.find((m) => m.id === modelB)?.name || 'Model B'

  const handleStartBattle = () => {
    if (!canStart) return
    setReadonlyDetailId(null)
    onClearOpenBattleDetail()
    cloudBackedBattleRef.current = false
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
            {selectableModels.map((m) => (
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
            {selectableModels.map((m) => (
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
          disabled={selectableModels.length === 0 || !currentUser}
          title={
            !currentUser
              ? '请使用 GitHub 登录后创建题目'
              : selectableModels.length === 0
                ? '需至少一个可用模型以使用命题辅助'
                : undefined
          }
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

  const mainPanel =
    openingDetailId != null ? (
      <section className="space-y-4">
        <p className="text-sm text-muted-foreground">正在打开对战详情…</p>
      </section>
    ) : readonlyDetailId != null ? (
      <BattleReadonlyDetail
        battleId={readonlyDetailId}
        onClose={() => {
          setReadonlyDetailId(null)
          onClearOpenBattleDetail()
        }}
        models={models}
        currentUser={currentUser}
      />
    ) : (
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
        currentUser={currentUser}
        terminalPersist={terminalPersist}
      />
    )

  return (
    <div className="space-y-6">
      {headerSlotEl ? createPortal(headerControls, headerSlotEl) : null}

      {mainPanel}

      <NewProblem
        open={newProblemOpen}
        onOpenChange={setNewProblemOpen}
        models={selectableModels.length > 0 ? selectableModels : models}
        defaultModelId={defaultAuthoringModelId(selectableModels.length > 0 ? selectableModels : models)}
        tagSuggestions={problemTagCatalog}
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
          models={selectableModels.length > 0 ? selectableModels : models}
          defaultModelId={defaultAuthoringModelId(selectableModels.length > 0 ? selectableModels : models)}
          tagSuggestions={problemTagCatalog}
          onConfirm={async (
            args: Parameters<NonNullable<ProblemEditorProps['onConfirm']>>[0],
          ) => {
            await persistProblemEditorUpdate(args)
            if (args.kind === 'update') {
              setProblemDetailOpen(false)
            }
          }}
          submitLabel="保存全部"
        />
      )}
    </div>
  )
}
