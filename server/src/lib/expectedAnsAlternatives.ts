export function isPrimitiveJson(x: unknown): boolean {
  return x === null || typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean'
}

export function migrateExpectedAnsJsonValue(parsed: unknown): unknown {
  if (parsed === undefined) return parsed
  if (parsed === null) return [null]
  if (typeof parsed === 'object' && !Array.isArray(parsed)) {
    const o = parsed as Record<string, unknown>
    if (Array.isArray(o.__anyOf)) return o.__anyOf
    return [parsed]
  }
  if (!Array.isArray(parsed)) return [parsed]
  if (parsed.length === 0) return parsed
  const allPrim = parsed.every(isPrimitiveJson)
  if (allPrim && parsed.length >= 2) return [parsed]
  return parsed
}

export function coerceAuthoringExpectedAns(ans: unknown): unknown {
  if (ans === undefined) return ans
  if (typeof ans === 'object' && ans !== null && !Array.isArray(ans)) return [ans]
  if (!Array.isArray(ans)) return [ans]
  return ans
}

export function expectedAcceptedAlternatives(ans: unknown): unknown[] {
  if (ans === undefined) return []
  if (!Array.isArray(ans)) return [ans]
  return ans
}
