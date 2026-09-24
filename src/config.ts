const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/

const fallbackAddress = '0xCd04E73447ab2210B5BbACa38b5F0F6717887275'

const envAddress = String(import.meta.env.VITE_CONTRACT_ADDRESS || '').trim()

export const CONTRACT_ADDRESS = (
  ADDRESS_RE.test(envAddress) ? envAddress : fallbackAddress
) as `0x${string}`

export const STUDIO_RPC =
  String(import.meta.env.VITE_STUDIO_RPC || '').trim() ||
  'https://studio.genlayer.com/api'

export const EXPLORER_BASE =
  String(import.meta.env.VITE_EXPLORER_BASE || '').trim() ||
  'https://explorer-studio.genlayer.com'

export const EXPLORER_URL = `${EXPLORER_BASE}/address/${CONTRACT_ADDRESS}`

export const STUDIO_CHAIN_ID = 61999
