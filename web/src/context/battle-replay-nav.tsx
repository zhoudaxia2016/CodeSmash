import { createContext, useContext, type ReactNode } from 'react'

type BattleDetailNavValue = {
  openBattleDetail: (battleId: string) => void
}

const BattleDetailNavContext = createContext<BattleDetailNavValue | null>(null)

export function BattleDetailNavProvider({
  children,
  value,
}: {
  children: ReactNode
  value: BattleDetailNavValue
}) {
  return <BattleDetailNavContext.Provider value={value}>{children}</BattleDetailNavContext.Provider>
}

export function useBattleDetailNav(): BattleDetailNavValue {
  const ctx = useContext(BattleDetailNavContext)
  if (!ctx) {
    throw new Error('useBattleDetailNav must be used within BattleDetailNavProvider')
  }
  return ctx
}
