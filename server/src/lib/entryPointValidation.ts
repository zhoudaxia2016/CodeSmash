/** Parse `function foo(` style name from signature (JS subset). */
export function parseFunctionNameFromSignature(functionSignature: string): string | null {
  const s = functionSignature.trim()
  const m = /^function\s+([a-zA-Z_$][\w$]*)\s*\(/.exec(s)
  return m ? m[1] : null
}

export function validateEntryPointAgainstSignature(
  entryPoint: string,
  functionSignature: string,
): { ok: true } | { ok: false; message: string } {
  const parsed = parseFunctionNameFromSignature(functionSignature)
  if (parsed == null) return { ok: true }
  if (parsed !== entryPoint.trim()) {
    return {
      ok: false,
      message: `entryPoint "${entryPoint}" must match function name in signature ("${parsed}")`,
    }
  }
  return { ok: true }
}
