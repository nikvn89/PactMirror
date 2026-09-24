// Models the ACTUAL pipeline:
//   frontend: sends clean(name) AND hashes clean(name)
//   contract: hashes py_strip( clean(name) )
// A mismatch means create_pact succeeds on chain while the UI computes an id
// that does not exist, with no way to recover it from the interface.
//
//   node tools/id-parity.mjs        (run from the project root, after npm install)
import { keccak256, toBytes } from 'viem'

const cpLen = (v) => Array.from(v).length

const PY_SPACE =
  '\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000'
const S = new RegExp('^[' + PY_SPACE + ']+')
const E = new RegExp('[' + PY_SPACE + ']+$')
const pyStrip = (v) => v.replace(S, '').replace(E, '')
const pyCollapse = (v) => v.split(new RegExp('[' + PY_SPACE + ']+')).filter(Boolean).join(' ')

const idOf = (n) =>
  keccak256(toBytes('RECIPROCITY_LOCK:PACT:V1|0xabc|' + cpLen(n) + '|' + n)).slice(2)

const N = 'Hosting pact'
const cases = [
  ['plain', N],
  ['leading spaces', '  ' + N],
  ['U+0085 NEL', '' + N],
  ['U+001C FS', '' + N],
  ['U+001D GS', '' + N],
  ['U+001E RS', '' + N],
  ['U+001F US trailing', N + ''],
  ['U+FEFF BOM', '﻿' + N],
  ['U+00A0 NBSP', ' ' + N],
  ['U+2028 LS trailing', N + ' '],
  ['U+3000 ideographic', '　' + N],
  ['emoji + padding', '  Pact \u{1F91D} mirror  '],
]

for (const [mode, clean] of [
  ['BEFORE   ids.ts used .trim()', (v) => v.trim()],
  ['AFTER    ids.ts uses pyStrip', (v) => pyStrip(v)],
]) {
  console.log('\n' + mode)
  let bad = 0
  for (const [label, raw] of cases) {
    const sent = clean(raw) // what the tx carries AND what the UI hashes
    const onChain = pyStrip(sent) // what the contract stores and hashes
    const ok = idOf(sent) === idOf(onChain)
    if (!ok) bad++
    console.log('  ' + label.padEnd(22) + (ok ? 'match' : 'MISMATCH - pact unreachable'))
  }
  console.log(`  => ${cases.length - bad}/${cases.length} reachable, ${bad} unreachable`)
}

const termIdOf = (pactId, text) =>
  keccak256(
    toBytes('RECIPROCITY_LOCK:TERM:V1|' + pactId.toLowerCase() + '|' + cpLen(text) + '|' + text),
  ).slice(2)

const pactId = 'a'.repeat(64)
const termCases = [
  ['plain', 'Controller may withdraw', 'Controller may withdraw'],
  ['double ASCII space', 'Controller  may withdraw', 'Controller may withdraw'],
  ['tabs and newline', 'Controller\tmay\nwithdraw', 'Controller may withdraw'],
  ['leading/trailing', '  Controller may withdraw  ', 'Controller may withdraw'],
  ['NBSP inside', 'Controller\u00a0may withdraw', 'Controller may withdraw'],
  ['U+0085 inside', 'Controller\u0085may withdraw', 'Controller may withdraw'],
  ['emoji plus spacing', 'Party A  \u{1F91D}\tParty B', 'Party A \u{1F91D} Party B'],
]

console.log('\nTERM ids.ts uses pyCollapse')
let termBad = 0
for (const [label, raw, onChain] of termCases) {
  const sent = pyCollapse(raw)
  const ok = sent === onChain && termIdOf(pactId, sent) === termIdOf(pactId, onChain)
  if (!ok) termBad++
  console.log('  ' + label.padEnd(22) + (ok ? 'match' : 'MISMATCH - term unreachable'))
}
console.log(`  => ${termCases.length - termBad}/${termCases.length} reachable, ${termBad} unreachable`)

if (termBad > 0) process.exitCode = 1
