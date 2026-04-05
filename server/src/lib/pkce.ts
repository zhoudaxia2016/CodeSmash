function base64UrlEncode(buf: Uint8Array): string {
  let bin = ''
  for (const b of buf) bin += String.fromCharCode(b)
  const b64 = btoa(bin)
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** RFC 7636: 43–128 chars; 32 random bytes → 43-char base64url. */
export function randomCodeVerifier(): string {
  const buf = new Uint8Array(32)
  crypto.getRandomValues(buf)
  return base64UrlEncode(buf)
}

export async function codeChallengeS256(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return base64UrlEncode(new Uint8Array(hash))
}
