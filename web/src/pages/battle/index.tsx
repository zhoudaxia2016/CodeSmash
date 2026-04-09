import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useMe, useProblem, useStartBattle, useBattle, useBattleResultDetail } from '@/hooks/useApi'
import { usePersistProblemEditorUpdate } from '@/hooks/usePersistProblemEditorUpdate'
import type { BattleSession, PlatformModel, Problem, ProblemGradingContext } from '@/types'
import {
  removeLocalBattleEntry,
  saveBattleToLocalHistory,
} from '@/utils/battle-local-history'
import { loadBattleSetupPrefs, saveBattleSetupPrefs } from '@/utils/battle-setup-prefs'
import { readBattleDetailIdFromUrl } from '@/utils/battle-url'
import { defaultAuthoringModelId } from '@/lib/authoring-model'
import { ProblemEditor, type ProblemEditorProps } from '@/components/problem-editor'
import { getLocalBattleEntry } from '@/utils/battle-local-history'
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

function applyBattleSessionToHeaderSelections(
  session: BattleSession,
  problems: Problem[],
  selectableModels: PlatformModel[],
  set: {
    setSelectedProblem: (id: string) => void
    setModelA: (id: string) => void
    setModelB: (id: string) => void
  },
) {
  if (session.problemId && problems.some((p) => p.id === session.problemId)) {
    set.setSelectedProblem(session.problemId)
  }
  if (session.modelAId && selectableModels.some((m) => m.id === session.modelAId)) {
    set.setModelA(session.modelAId)
  }
  if (session.modelBId && selectableModels.some((m) => m.id === session.modelBId)) {
    set.setModelB(session.modelBId)
  }
}

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
  const [openingDetailId, setOpeningDetailId] = useState<string | null>(null)
  const [archiveMode, setArchiveMode] = useState(false)
  const [terminalPersist, setTerminalPersist] = useState<'local' | 'cloud' | 'cloud_error' | null>(null)
  const uploadedTerminalRef = useRef<string | null>(null)
  /** 从云端恢复进内存的对战：只更新云端，不写本地历史（避免「本地+云端」重复）。 */
  const cloudBackedBattleRef = useRef(false)
  const [startBattleErr, setStartBattleErr] = useState<string | null>(null)
  /** 已从 session 对齐过顶栏的 `battleId`，避免轮询重复 setState。 */
  const headerAppliedForBattleIdRef = useRef<string | null>(null)

  const { mutate: startBattle, isPending: battleStarting } = useStartBattle()
  const liveBattleId = archiveMode ? '' : (battleId || '')
  const { data: battle, isLoading: battleLoading, isError: battleError } = useBattle(liveBattleId)
  const {
    data: archiveBattle,
    isLoading: archiveBattleLoading,
    isError: archiveBattleError,
  } = useBattleResultDetail(battleId || '', archiveMode && !!battleId)
  const localArchiveBattle =
    archiveMode && battleId ? (getLocalBattleEntry(battleId)?.battle ?? null) : null
  const cloudArchiveBattle = archiveBattle ?? null
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

  const problemsRef = useRef(problems)
  const selectableModelsRef = useRef(selectableModels)
  problemsRef.current = problems
  selectableModelsRef.current = selectableModels

  const [headerSlotEl, setHeaderSlotEl] = useState<HTMLElement | null>(null)

  useLayoutEffect(() => {
    setHeaderSlotEl(document.getElementById(HEADER_SLOT_ID))
  }, [])

  useEffect(() => {
    if (problems.length === 0) return
    const openingFromUrl =
      !!openBattleDetailId || readBattleDetailIdFromUrl() != null
    setSelectedProblem((prev) => {
      if (openingFromUrl) {
        return problems[0]?.id ?? ''
      }
      if (prev && problems.some((p) => p.id === prev)) return prev
      const prefs = loadBattleSetupPrefs()
      if (prefs.problemId && problems.some((p) => p.id === prefs.problemId)) {
        return prefs.problemId
      }
      return problems[0].id
    })
  }, [problems, openBattleDetailId])

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
    const isCloudBacked = cloudBackedBattleRef.current
    const shouldPostCloud = !!currentUser

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
    } else if (!isCloudBacked && !archiveMode) {
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
  }, [battle, battleId, currentUser, queryClient, archiveMode])

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
          setArchiveMode(false)
          setOpeningDetailId(null)
          return
        } catch {
          // 无云端可恢复会话时，回退为只读历史详情（本地/云端均可展示）
        }
      }
      if (!cancelled) {
        setBattleId(id)
        setArchiveMode(true)
      }
      setOpeningDetailId(null)
    })()

    return () => {
      cancelled = true
    }
  }, [openBattleDetailId, currentUser?.id, queryClient])

  useEffect(() => {
    if (!battleId) headerAppliedForBattleIdRef.current = null
  }, [battleId])

  const detailBattle = archiveMode ? (cloudArchiveBattle ?? localArchiveBattle ?? null) : (battle ?? null)

  useEffect(() => {
    if (!battleId || !detailBattle || detailBattle.id !== battleId) return
    if (headerAppliedForBattleIdRef.current === battleId) return
    if (problems.length === 0 || selectableModels.length === 0) return
    applyBattleSessionToHeaderSelections(detailBattle, problems, selectableModels, {
      setSelectedProblem,
      setModelA,
      setModelB,
    })
    headerAppliedForBattleIdRef.current = battleId
  }, [battleId, detailBattle, problems, selectableModels])

  useEffect(() => {
    if (selectableModels.length === 0) return
    const openingFromUrl =
      !!openBattleDetailId || readBattleDetailIdFromUrl() != null
    setModelA((prev) => {
      if (openingFromUrl) {
        return selectableModels[0]?.id ?? ''
      }
      if (prev && selectableModels.some((m) => m.id === prev)) return prev
      const prefs = loadBattleSetupPrefs()
      if (prefs.modelAId && selectableModels.some((m) => m.id === prefs.modelAId)) {
        return prefs.modelAId
      }
      return selectableModels[0].id
    })
  }, [selectableModels, openBattleDetailId])

  useEffect(() => {
    if (selectableModels.length === 0) return
    const openingFromUrl =
      !!openBattleDetailId || readBattleDetailIdFromUrl() != null
    const prefs = openingFromUrl ? null : loadBattleSetupPrefs()
    const resolvedA =
      (modelA && selectableModels.some((m) => m.id === modelA) ? modelA : null) ??
      (prefs?.modelAId && selectableModels.some((m) => m.id === prefs.modelAId) ? prefs.modelAId : null) ??
      selectableModels[0].id

    setModelB((prev) => {
      if (openingFromUrl) {
        const alt = selectableModels.find((m) => m.id !== resolvedA)
        return alt?.id ?? selectableModels[0]?.id ?? ''
      }
      const valid = (id: string) => selectableModels.some((m) => m.id === id)
      if (prev && valid(prev) && prev !== resolvedA) return prev
      if (
        prefs?.modelBId &&
        valid(prefs.modelBId) &&
        prefs.modelBId !== resolvedA
      ) {
        return prefs.modelBId
      }
      const alt = selectableModels.find((m) => m.id !== resolvedA)
      return alt?.id ?? selectableModels[0].id
    })
  }, [selectableModels, modelA, openBattleDetailId])

  useEffect(() => {
    if (readBattleDetailIdFromUrl() || openBattleDetailId) return
    if (!selectedProblem || !problems.some((p) => p.id === selectedProblem)) return
    if (!modelA || !modelB || modelA === modelB) return
    if (!selectableModels.some((m) => m.id === modelA) || !selectableModels.some((m) => m.id === modelB)) return
    saveBattleSetupPrefs({
      problemId: selectedProblem,
      modelAId: modelA,
      modelBId: modelB,
    })
  }, [selectedProblem, modelA, modelB, problems, selectableModels, openBattleDetailId])

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
    setStartBattleErr(null)
    setArchiveMode(false)
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
        onError: (e) => {
          setStartBattleErr(e instanceof Error ? e.message : '无法开始对战')
        },
      },
    )
  }

  const headerControls = (
    <>
      <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:gap-3">
        <Select value={selectedProblem} onValueChange={setSelectedProblem}>
          <SelectTrigger
            className="h-9 w-full sm:w-auto sm:min-w-[10rem] sm:max-w-[18rem]"
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
        <div className="flex gap-2">
          <Select value={modelA} onValueChange={setModelA}>
            <SelectTrigger
              className="h-9 flex-1 min-w-[8rem] sm:w-[11rem] sm:flex-none"
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
              className="h-9 flex-1 min-w-[8rem] sm:w-[11rem] sm:flex-none"
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
        </div>
        <div className="flex flex-wrap gap-2 sm:flex-nowrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1 gap-1.5 sm:flex-none"
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
            className="flex-1 sm:flex-none"
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
          <Button
            type="button"
            disabled={!canStart || battleStarting}
            onClick={handleStartBattle}
            className="h-9 flex-1 sm:flex-none"
          >
            {battleStarting ? '创建中…' : '开始对战'}
          </Button>
        </div>
      </div>
      {startBattleErr ? (
        <p className="text-sm text-destructive" role="alert">
          {startBattleErr}
        </p>
      ) : null}
    </>
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
    ) : (
      <Result
        battle={detailBattle}
        battleId={battleId}
        battleLoading={!!battleId && (archiveMode ? archiveBattleLoading : battleLoading)}
        battleError={!!battleId && (archiveMode ? archiveBattleError : battleError)}
        starting={battleStarting}
        selectedProblemId={selectedProblem}
        modelAName={modelAName}
        modelBName={modelBName}
        runTestCases={runTestCases}
        battleTestsReady={battleTestsReady}
        grading={gradingContext}
        currentUser={currentUser}
        terminalPersist={terminalPersist}
        archiveMode={archiveMode}
      />
    )

  return (
    <div className="space-y-6">
      {headerSlotEl ? createPortal(headerControls, headerSlotEl) : headerControls}

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
