export function expectedAcceptedAlternatives(ans: unknown): unknown[] {
  if (ans === undefined) return []
  if (!Array.isArray(ans)) return [ans]
  return ans
}
