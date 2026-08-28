import { createClient } from 'genlayer-js'
import { studionet } from 'genlayer-js/chains'
import { getAddress } from 'viem'
import { CONTRACT_ADDRESS, STUDIO_CHAIN_ID, STUDIO_RPC } from './config'
import { normalizeError } from './errors'

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<any>
  on?: (event: string, listener: (...args: any[]) => void) => void
  removeListener?: (event: string, listener: (...args: any[]) => void) => void
}

declare global {
  interface Window {
    ethereum?: EthereumProvider
  }
}

export type PactState = {
  pact_id: string
  creator: string
  party_a: string
  party_b: string
  name: string
  role_a_label: string
  role_b_label: string
  right_label: string
  active_term_id: string
  exited: boolean
  exited_by: string
  attempt_count: number
  state: 'DRAFT' | 'ACTIVE' | 'EXITED'
}

export type AttemptSummary = {
  attempt_number: number
  term_id: string
  verdict: 'RIGHT_MIRRORED' | 'RIGHT_NOT_MIRRORED'
  mirrored: boolean
}

export type TermState = {
  term_id: string
  pact_id: string
  text: string
  verdict_code: number
  verdict: 'RIGHT_MIRRORED' | 'RIGHT_NOT_MIRRORED'
  mirrored: boolean
}

const readRpc = () => {
  if (typeof window === 'undefined') return STUDIO_RPC
  return `${window.location.origin}/api/rpc`
}

// genlayer-js 1.1.8 routes only 6 methods through window.ethereum
// (eth_accounts, eth_requestAccounts, eth_sendTransaction, eth_signTransaction,
// personal_sign, eth_signTypedData_v4). Everything else - including the
// eth_estimateGas / eth_gasPrice / eth_getTransactionCount calls that every
// write makes - does fetch(chain.rpcUrls.default.http[0]). So the WRITE client
// must use the proxied chain too, or those calls leave the same origin.
const proxiedChain = () => ({
  ...studionet,
  rpcUrls: {
    default: { http: [readRpc()] },
  },
})

const getReadClient = () =>
  createClient({
    chain: proxiedChain(),
  } as any)

const getWriteClient = (account: string) =>
  createClient({
    chain: proxiedChain(),
    account: getAddress(account) as any,
    provider: window.ethereum as any,
  } as any)

// B1 replacement for client.connect('studionet').
// connect() calls wallet_getSnaps + wallet_requestSnaps, which asks the
// reviewer to install the GenLayer MetaMask Snap before every write. This does
// the same job with plain EIP-3085/3326 and no Snap. The chain is registered
// with the CANONICAL StudioNet RPC URL, never the local proxy origin.
const STUDIO_CHAIN_HEX = `0x${STUDIO_CHAIN_ID.toString(16)}`

async function ensureStudioNet() {
  const ethereum = window.ethereum
  if (!ethereum) throw new Error('No browser wallet detected.')

  const current = await ethereum.request({ method: 'eth_chainId' })
  if (String(current).toLowerCase() === STUDIO_CHAIN_HEX) return

  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: STUDIO_CHAIN_HEX }],
    })
    return
  } catch (err: any) {
    // 4902 = chain unknown to the wallet. Anything else is a real failure.
    if (err?.code !== 4902 && err?.data?.originalError?.code !== 4902) throw err
  }

  await ethereum.request({
    method: 'wallet_addEthereumChain',
    params: [
      {
        chainId: STUDIO_CHAIN_HEX,
        chainName: 'GenLayer StudioNet',
        rpcUrls: [STUDIO_RPC],
        nativeCurrency: { name: 'GEN Token', symbol: 'GEN', decimals: 18 },
      },
    ],
  })
  await ethereum.request({
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: STUDIO_CHAIN_HEX }],
  })
}

const unpack = <T,>(raw: unknown): T => {
  if (raw && typeof raw === 'object' && 'result' in (raw as any)) {
    return unpack<T>((raw as any).result)
  }

  if (typeof raw === 'string') {
    const text = raw.trim()
    try {
      return JSON.parse(text) as T
    } catch {
      return raw as T
    }
  }

  return raw as T
}

const isHexAddress = (value: unknown) =>
  typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value)

const isId = (value: unknown) =>
  typeof value === 'string' && /^[a-fA-F0-9]{64}$/.test(value)

// GenLayer may return a Python int as a JSON number, a decimal string, or a
// bigint depending on transport. Accept all three; never fabricate a value.
const isCount = (value: unknown) =>
  (typeof value === 'number' && Number.isFinite(value)) ||
  typeof value === 'bigint' ||
  (typeof value === 'string' && /^\d+$/.test(value.trim()))

const toCount = (value: unknown) => Number(value)

function validatePact(value: any): PactState {
  if (
    !value ||
    !isId(value.pact_id) ||
    !isHexAddress(value.creator) ||
    !isHexAddress(value.party_b) ||
    !['DRAFT', 'ACTIVE', 'EXITED'].includes(value.state) ||
    typeof value.name !== 'string' ||
    typeof value.role_a_label !== 'string' ||
    typeof value.role_b_label !== 'string' ||
    typeof value.right_label !== 'string' ||
    typeof value.exited !== 'boolean' ||
    !isCount(value.attempt_count)
  ) {
    throw new Error('Malformed get_pact response from RPC.')
  }

  return { ...value, attempt_count: toCount(value.attempt_count) } as PactState
}

function validateAttempts(value: any): AttemptSummary[] {
  if (!Array.isArray(value)) {
    throw new Error('Malformed get_attempts response from RPC.')
  }

  return value.map((item) => {
    if (
      !item ||
      !isCount(item.attempt_number) ||
      !isId(item.term_id) ||
      !['RIGHT_MIRRORED', 'RIGHT_NOT_MIRRORED'].includes(item.verdict) ||
      typeof item.mirrored !== 'boolean'
    ) {
      throw new Error('Malformed attempt record from RPC.')
    }
    return { ...item, attempt_number: toCount(item.attempt_number) } as AttemptSummary
  })
}

function validateTerm(value: any): TermState {
  if (
    !value ||
    !isId(value.term_id) ||
    !isId(value.pact_id) ||
    typeof value.text !== 'string' ||
    !['RIGHT_MIRRORED', 'RIGHT_NOT_MIRRORED'].includes(value.verdict) ||
    typeof value.mirrored !== 'boolean'
  ) {
    throw new Error('Malformed get_term response from RPC.')
  }

  return value as TermState
}

async function read(functionName: string, args: Array<string | number> = []) {
  const client = getReadClient()
  return client.readContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    stateStatus: 'accepted',
  } as any)
}

async function submit(
  account: string,
  functionName: string,
  args: Array<string | number>,
) {
  if (!window.ethereum) {
    throw new Error('No browser wallet detected.')
  }

  await ensureStudioNet()

  const client = getWriteClient(account)

  // Once this returns a hash, the write is submitted. We intentionally do not
  // poll receipts here; state is reloaded explicitly through the same-origin
  // read proxy to avoid false failure / duplicate submission behavior.
  const hash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    value: 0n,
  } as any)

  return String(hash)
}

export async function connectWallet() {
  if (!window.ethereum) {
    throw new Error('No browser wallet detected. Install MetaMask or a compatible wallet.')
  }

  const accounts = (await window.ethereum.request({
    method: 'eth_requestAccounts',
  })) as string[]

  if (!accounts?.[0]) {
    throw new Error('Wallet connection was not approved.')
  }

  const account = getAddress(accounts[0])
  await ensureStudioNet()
  return account
}

export async function passiveWallet() {
  if (!window.ethereum) return ''
  const accounts = (await window.ethereum.request({
    method: 'eth_accounts',
  })) as string[]
  return accounts?.[0] ? getAddress(accounts[0]) : ''
}

export const reciprocityLock = {
  createPact: (
    account: string,
    name: string,
    partyB: string,
    roleA: string,
    roleB: string,
    rightLabel: string,
  ) =>
    submit(account, 'create_pact', [
      name.trim(),
      getAddress(partyB.trim()),
      roleA.trim(),
      roleB.trim(),
      rightLabel.trim(),
    ]),

  submitTerm: (account: string, pactId: string, text: string) =>
    submit(account, 'submit_term', [pactId.trim().toLowerCase(), text.trim()]),

  exerciseRight: (account: string, pactId: string) =>
    submit(account, 'exercise_right', [pactId.trim().toLowerCase()]),

  getPact: async (pactId: string) =>
    validatePact(unpack(await read('get_pact', [pactId.trim().toLowerCase()]))),

  getAttempts: async (pactId: string) =>
    validateAttempts(
      unpack(await read('get_attempts', [pactId.trim().toLowerCase(), 0, 50])),
    ),

  getTerm: async (termId: string) =>
    validateTerm(unpack(await read('get_term', [termId.trim().toLowerCase()]))),

  getConfig: async () => unpack(await read('get_config')),
}

export { normalizeError }
