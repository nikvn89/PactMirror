const collect = (error: unknown, depth = 0): string[] => {
  if (depth > 4 || error == null) return []
  const any = error as any
  const out: string[] = []
  for (const value of [
    any?.shortMessage,
    any?.details,
    any?.data?.message,
    any?.error?.message,
    any?.message,
    typeof error === 'string' ? error : '',
  ]) {
    if (typeof value === 'string' && value.trim()) out.push(value)
  }
  if (any?.cause) out.push(...collect(any.cause, depth + 1))
  return out
}

// GenLayer surfaces a contract revert as text inside the RPC error rather than
// as a typed error. Without this the reviewer sees a generic viem blob and the
// exact revert string required by the negative tests is unrecoverable.
function extractContractRevert(raw: string): string {
  const rollback = raw.match(/\[rollback\]\s*([^\n"]+)/i)
  if (rollback?.[1]) return rollback[1].trim()

  const userError = raw.match(/UserError[:\s]+([^\n"]+)/i)
  if (userError?.[1]) return userError[1].trim()

  const reverted = raw.match(/execution reverted[:\s]+([^\n"]+)/i)
  if (reverted?.[1]) return reverted[1].trim()

  return ''
}

export function normalizeError(error: unknown): string {
  const candidates = collect(error)
  const joined = candidates.join('\n')

  const revert = extractContractRevert(joined)
  if (revert) return `Contract rejected the call: ${revert}`

  const message = String(candidates[0] || 'Unknown error')
    .replace(/^Error:\s*/i, '')
    .trim()

  if (/user rejected|user denied|rejected the request/i.test(message)) {
    return 'Wallet request was rejected.'
  }

  if (/wallet_requestSnaps|wallet_getSnaps|snap/i.test(message)) {
    return 'The wallet asked for a MetaMask Snap. PactMirror does not require one; reload the page and retry.'
  }

  if (/429|rate limit/i.test(message)) {
    return 'StudioNet is rate-limiting requests. Wait briefly, then refresh state. Do not resubmit a transaction that already returned a hash.'
  }

  if (/failed to fetch|network error|cors/i.test(message)) {
    return 'Network/RPC read failed. If a transaction hash was already returned, do not submit the same action again; refresh authoritative state instead.'
  }

  return message
}
