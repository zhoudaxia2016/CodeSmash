import { create } from 'zustand'
import type { Problem, PlatformModel, BattleSession } from '../types'

interface AppState {
  problems: Problem[]
  models: PlatformModel[]
  currentProblem: Problem | null
  selectedModels: [string, string] | null
  battleSession: BattleSession | null
  setProblems: (problems: Problem[]) => void
  setModels: (models: PlatformModel[]) => void
  setCurrentProblem: (problem: Problem | null) => void
  setSelectedModels: (models: [string, string] | null) => void
  setBattleSession: (session: BattleSession | null) => void
  updateBattleSession: (updates: Partial<BattleSession>) => void
}

export const useAppStore = create<AppState>((set) => ({
  problems: [],
  models: [],
  currentProblem: null,
  selectedModels: null,
  battleSession: null,
  setProblems: (problems) => set({ problems }),
  setModels: (models) => set({ models }),
  setCurrentProblem: (currentProblem) => set({ currentProblem }),
  setSelectedModels: (selectedModels) => set({ selectedModels }),
  setBattleSession: (battleSession) => set({ battleSession }),
  updateBattleSession: (updates) =>
    set((state) => ({
      battleSession: state.battleSession ? { ...state.battleSession, ...updates } : null,
    })),
}))
