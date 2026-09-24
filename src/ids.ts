import { keccak256, toBytes } from 'viem'

// Python len() counts code points; JS .length counts UTF-16 units.
const codePointLength = (value: string) => Array.from(value).length

// Python str.strip() and JS String.trim() do NOT strip the same set.
// Python also strips U+001C U+001D U+001E U+001F U+0085; JS also strips U+FEFF.
// The contract hashes name.strip() / text.strip(), so the frontend must strip
// the Python set or it will compute an id that does not exist on chain.
// This list is exactly Python's str.isspace() set.
const PY_SPACE =
  '\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000'
const PY_TRIM_START = new RegExp('^[' + PY_SPACE + ']+')
const PY_TRIM_END = new RegExp('[' + PY_SPACE + ']+$')

export function pyStrip(value: string) {
  return value.replace(PY_TRIM_START, '').replace(PY_TRIM_END, '')
}

/** Match Python's " ".join(value.split()) for contract term normalization. */
export function pyCollapse(value: string) {
  return value.split(new RegExp('[' + PY_SPACE + ']+')).filter(Boolean).join(' ')
}

export function pyLen(value: string) {
  return codePointLength(value)
}

export function pactIdFor(creator: string, name: string) {
  const clean = pyStrip(name)
  const payload =
    'RECIPROCITY_LOCK:PACT:V1|' +
    creator.toLowerCase() +
    '|' +
    codePointLength(clean) +
    '|' +
    clean

  return keccak256(toBytes(payload)).slice(2).toLowerCase()
}

export function termIdFor(pactId: string, text: string) {
  const clean = pyCollapse(text)
  const payload =
    'RECIPROCITY_LOCK:TERM:V1|' +
    pactId.toLowerCase() +
    '|' +
    codePointLength(clean) +
    '|' +
    clean

  return keccak256(toBytes(payload)).slice(2).toLowerCase()
}

export function isContractId(value: string) {
  return /^[a-fA-F0-9]{64}$/.test(value.trim())
}
