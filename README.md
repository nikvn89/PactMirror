# PactMirror

**Project dApp:** PactMirror  
**Intelligent Contract:** ReciprocityLock

> **Honest limitation.** PactMirror checks exactly one declared bilateral right in submitted text: whether that right is granted to both declared roles under the same conditions. It does not judge overall fairness, commercial balance, legal enforceability, real-world identity, or whether an off-chain agreement was actually terminated. `EXITED` is contract state only.

The mirrored right in V1 is **shared and one-shot**: the first successful `exercise_right` ends the pact for both parties. This consequence shape is appropriate for a terminating right; it would mis-model independently repeatable rights such as audit or inspection rights.

The rubric is public through `get_rubric`, so semantic grinding is not a closed problem. A creator can aim at the rubric within the five-attempt cap. The deterrents are the small cap, permanent attempt history, and the fact that a successful mirrored term also arms the counterparty with the same one-shot right.

## Project backend

```text
Project contract:
0x1613A25aE378b3e1e82e4840733BDED53b19f1a8

Explorer:
https://explorer-studio.genlayer.com/address/0x1613A25aE378b3e1e82e4840733BDED53b19f1a8
```

The frontend is configured to the Project contract above. It does **not** use the separate standalone Intelligent Contract submission address.

## What the app makes visible

The contract's semantic enum is intentionally narrow:

```text
RIGHT_MIRRORED
RIGHT_NOT_MIRRORED
```

The UI renders a mirrored two-role layout:

```text
Party A  ⇄  Party B
```

A `RIGHT_NOT_MIRRORED` term leaves the pact in `DRAFT`, so `exercise_right` remains unavailable.

A `RIGHT_MIRRORED` term installs the active term and moves the pact to `ACTIVE`. Either declared party can then exercise the one-shot shared right, moving the pact permanently to `EXITED`.

## Contract is the source of truth

The frontend never calculates:

- semantic verdicts
- authoritative pact state
- attempt count
- active term
- authorization
- `exited_by`

It only:

- accepts input
- submits transactions
- displays the returned transaction hash as **submitted**
- explicitly reloads accepted contract state
- renders the authoritative result

The UI does not mark a transaction accepted/finalized merely because MetaMask returned a hash.

## RPC / double-submit design

Reads use a same-origin `/api/rpc` proxy.

Writes use MetaMask through `genlayer-js`.

After `writeContract()` returns a hash, the frontend intentionally **does not poll receipts**. It automatically re-reads **accepted contract state** through the same-origin `/api/rpc` proxy every 15 seconds, stopping as soon as the expected authoritative state change appears. The manual **Refresh state** button remains available as a fallback.

A read failure or timeout after a transaction hash is **not** treated as a transaction failure, and the frontend never auto-resubmits the write.

## Local IDs

`pact_id` is computed in the browser using the same content-addressed formula as the contract:

```text
keccak256(
  "RECIPROCITY_LOCK:PACT:V1|" +
  creator.lower() + "|" +
  len(name) + "|" +
  name
)
```

There is no contract view that sends the natural-language text back as calldata merely to compute an ID.

## Frontend workflow

### Pact tab

1. Connect MetaMask to StudioNet.
2. Create your own pact or paste an existing Pact ID.
3. Refresh accepted state.
4. Creator submits a term.
5. Refresh to see the contract verdict/state.
6. When state is `ACTIVE`, Party A or Party B may exercise the shared right.

### Terms tab

Shows the append-only attempt log returned by:

```text
get_attempts
get_term
```

At most five accepted semantic attempts exist per pact.

## Reviewer demo text

Asymmetric term:

```text
Either party may terminate on thirty days written notice. The Provider may also terminate immediately at its own discretion.
```

Expected contract behavior from the already-tested source design:

```text
RIGHT_NOT_MIRRORED
DRAFT
```

Mirrored term:

```text
Either party may terminate on thirty days written notice. Neither party has any other right to terminate.
```

Expected contract behavior from the already-tested source design:

```text
RIGHT_MIRRORED
ACTIVE
```

The Project frontend itself must still be tested against the Project deployment before any Vercel PASS is claimed.

## Separate standalone Intelligent Contract evidence

The reviewed source was previously runtime-tested on the separate standalone deployment:

```text
0x478942A99631cB3357f4480210AF9c5a9bc8c3C2
```

Observed there:

K1 submitted:

```text
Each side is free to end this agreement on thirty days written notice.
```

Observed:

```text
RIGHT_MIRRORED
```

K2 submitted:

```text
The Provider may terminate on thirty days notice; the Customer may terminate the hosting module alone.
```

Observed:

```text
RIGHT_NOT_MIRRORED
```

The normal flow then observed:

```text
DRAFT asymmetric term -> exercise_right rollback
mirrored term -> ACTIVE
exercise_right -> EXITED
```

That evidence supports the contract source behavior, but this README does **not** pretend it is frontend integration evidence for the Project address.

## Development

```bash
npm install
npm run dev
```

Vite proxies local `/api/rpc` requests to StudioNet.

Production build:

```bash
npm run build
```

## Environment

Copy `.env.example` to `.env` only if overriding defaults.

```text
VITE_CONTRACT_ADDRESS=0x1613A25aE378b3e1e82e4840733BDED53b19f1a8
VITE_STUDIO_RPC=https://studio.genlayer.com/api
VITE_EXPLORER_BASE=https://explorer-studio.genlayer.com
```

## Branding

The project includes two separate assets:

```text
/public/pactmirror-logo.svg   -> PactMirror project logo
/public/genlayer-logo.png     -> exact GenLayer logo supplied by the user
```

The two logos must not be swapped or substituted.


## Observed local Project frontend runtime evidence

The patched PactMirror frontend was exercised locally against the **Project contract**:

```text
0x1613A25aE378b3e1e82e4840733BDED53b19f1a8
```

Test wallets:

```text
Party A / creator:
0x6276095FAEA15108740445ff277fdA8c304657F4

Party B:
0x146e44881d35814bA582D265AF5b97ef2695ec8e
```

Observed pact:

```text
name: Hosting pact local 01
pact_id: 6fb0d832b647124c1ba7f52b35693773a954fdd48eea88fae124653ef7522e2b
```

Observed browser flow:

```text
1. create_pact
   -> transaction hash returned
   -> accepted state loaded as DRAFT
   -> attempt_count = 0

2. asymmetric term
   -> RIGHT_NOT_MIRRORED
   -> state remained DRAFT
   -> attempt_count = 1
   -> accepted state updated automatically

3. mirrored term
   -> RIGHT_MIRRORED
   -> state became ACTIVE
   -> attempt_count = 2
   -> active_term_id present
   -> accepted state updated automatically

4. exercise_right by Party A
   -> state became EXITED
   -> exited = true
   -> exited_by = 0x6276095FAEA15108740445ff277fdA8c304657F4
   -> shared one-shot right shown as USED
   -> accepted state updated automatically

5. Terms tab
   -> #1 RIGHT_NOT_MIRRORED / remains DRAFT
   -> #2 RIGHT_MIRRORED / activates right
   -> append-only history rendered correctly
```

The user did **not** manually press `Refresh state` for the semantic-result or exit transitions above. The frontend's accepted-state auto-refresh behavior therefore has observed local runtime evidence.

Evidence screenshots are stored under:

```text
docs/runtime-evidence/
```

### Current evidence boundary

Local Project frontend runtime: **PASS**

Vercel production deployment: **NOT TESTED YET**

Vercel end-to-end transaction flow: **NOT TESTED YET**

No production/Vercel PASS is claimed until that deployment is actually tested.
