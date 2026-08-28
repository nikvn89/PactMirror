# PactMirror Project Testing

## Project deployment under test

```text
0x1613A25aE378b3e1e82e4840733BDED53b19f1a8
```

Explorer:

```text
https://explorer-studio.genlayer.com/address/0x1613A25aE378b3e1e82e4840733BDED53b19f1a8
```

## Current status

Claude completed adversarial frontend review and returned `READY FOR LOCAL PROJECT TEST WITH FIXES`. The supplied source patches are applied in this package. Project frontend runtime testing has **not** been run yet.

Do not claim:

```text
Vercel PASS
frontend transaction PASS
Project-address semantic PASS
```

until those are actually observed.

## Honest limitation carried into Project testing

- The V1 mirrored right is **shared and one-shot**. The first successful `exercise_right` ends the pact for both parties. It is not an independently repeatable right held once by each side.
- The rubric is public through `get_rubric`. A creator can aim at it within the five-attempt cap; the cap, append-only attempt history, and arming of the counterparty are deterrents, not a proof that grinding is impossible.

## Exact standalone kill-test evidence for the same reviewed source

Standalone address:

```text
0x478942A99631cB3357f4480210AF9c5a9bc8c3C2
```

K1 text:

```text
Each side is free to end this agreement on thirty days written notice.
```

Observed:

```text
RIGHT_MIRRORED
```

K2 text:

```text
The Provider may terminate on thirty days notice; the Customer may terminate the hosting module alone.
```

Observed:

```text
RIGHT_NOT_MIRRORED
```

This is source-level/runtime evidence from the standalone deployment only. It is not substituted for Project-address frontend testing.

## Build checks reported by Claude review

Claude ran the patched package and reported:

```text
npm install -> PASS
added 285 packages in 43s

npm run build -> PASS
tsc -b && vite build
478 modules transformed
BUILD_RC=0
```

These are build-environment results from Claude's review package, not Project runtime evidence.

## Required Project integration flow after Claude review

### P1 — connect / create / refresh

Connect creator wallet.

Create:

```text
name: Hosting pact project
party_b: another wallet
role_a_label: Provider
role_b_label: Customer
right_label: termination on thirty days written notice
```

The UI must show only:

```text
Transaction submitted
```

after a hash is returned.

After consensus, click Refresh state.

Observe authoritative:

```text
state = DRAFT
attempt_count = 0
```

### P2 — asymmetric term

Submit:

```text
Either party may terminate on thirty days written notice. The Provider may also terminate immediately at its own discretion.
```

After the hash, do not submit again.

Refresh accepted state.

Observe contract result. The frontend must render the returned verdict and must not invent one.

For source parity with the already-tested contract, expected behavior is:

```text
RIGHT_NOT_MIRRORED
DRAFT
attempt_count = 1
```

But mark PASS only from Project-address observation.

### P3 — exercise while DRAFT

The UI should disable the normal exercise button while accepted state is `DRAFT`.

Contract-level negative enforcement remains authoritative; UI disablement is only UX.

### P4 — mirrored term

Submit:

```text
Either party may terminate on thirty days written notice. Neither party has any other right to terminate.
```

Refresh accepted state.

For source parity, expected:

```text
RIGHT_MIRRORED
ACTIVE
attempt_count = 2
```

Again, record the actual Project-address observation.

### P5 — either-party exercise

Using Party A or Party B, call Exercise right.

After transaction hash, wait and Refresh state.

Expected source behavior:

```text
EXITED
exited = true
exited_by = caller
```

## RPC safety checks

- Reads should go through `/api/rpc`.
- A read failure after a transaction hash must not present the transaction as definitely failed.
- No receipt polling loop should start after `writeContract`.
- Buttons are disabled while the corresponding write call is in progress.
- Accepted state refresh is authoritative.
- After a transaction hash, the UI automatically re-reads accepted contract state every 15 seconds, without receipt polling.
- Manual Refresh state remains available as a fallback.
- Account changes should update the connected wallet display.

## Long calldata

The standalone deployment previously passed an `eth_estimateGas` probe with a 311-byte serialized `submit_term` payload. The Project deployment has not yet repeated a signed long-write test.

The frontend permits the contract's 1200-character limit but reviewer demo text should remain short until Project-address long-write runtime evidence exists.


# Local Project Runtime Result

## Verdict

```text
LOCAL PROJECT FRONTEND FLOW: PASS
AUTO ACCEPTED-STATE REFRESH: PASS
TERMS APPEND-ONLY VIEW: PASS
VERCEL: NOT TESTED YET
```

## Project contract

```text
0x1613A25aE378b3e1e82e4840733BDED53b19f1a8
```

Explorer:

```text
https://explorer-studio.genlayer.com/address/0x1613A25aE378b3e1e82e4840733BDED53b19f1a8
```

## Wallets used

```text
Party A:
0x6276095FAEA15108740445ff277fdA8c304657F4

Party B:
0x146e44881d35814bA582D265AF5b97ef2695ec8e
```

## Pact

```text
Hosting pact local 01
6fb0d832b647124c1ba7f52b35693773a954fdd48eea88fae124653ef7522e2b
```

## Observed sequence

### T1 — create

Observed:

```text
DRAFT
attempt_count = 0
active_term_id = empty
```

### T2 — asymmetric term

Submitted:

```text
Either party may terminate on thirty days written notice. The Provider may also terminate immediately at its own discretion.
```

Observed automatically after accepted-state refresh:

```text
RIGHT_NOT_MIRRORED
DRAFT
attempt_count = 1
shared right = LOCKED
```

### T3 — mirrored term

Submitted:

```text
Either party may terminate on thirty days written notice. Neither party has any other right to terminate.
```

Observed automatically:

```text
RIGHT_MIRRORED
ACTIVE
attempt_count = 2
active_term_id = present
shared right = READY
```

### T4 — exercise

Called by Party A.

Observed automatically:

```text
EXITED
exited = true
exited_by = 0x6276095FAEA15108740445ff277fdA8c304657F4
shared right = USED
```

### T5 — Terms tab

Observed:

```text
#1 RIGHT_NOT_MIRRORED -> REMAINS DRAFT
#2 RIGHT_MIRRORED     -> ACTIVATES RIGHT
```

The term history is append-only and matches `attempt_count = 2`.

## Auto-refresh behavior

Observed working in browser:

```text
transaction hash returned
-> no receipt polling
-> no automatic resubmission
-> accepted contract state re-read through /api/rpc
-> UI updated automatically
```

Manual `Refresh state` remains only as fallback.

## Evidence files

```text
docs/runtime-evidence/01_create_submitted.png
docs/runtime-evidence/02_draft_loaded.png
docs/runtime-evidence/03_not_mirrored_auto_refresh.png
docs/runtime-evidence/04_mirrored_active_auto_refresh.png
docs/runtime-evidence/05_exited_auto_refresh.png
docs/runtime-evidence/06_terms_append_only.png
```

## Still required before final submission

```text
1. Deploy frontend to Vercel.
2. Open production URL.
3. Connect MetaMask on StudioNet.
4. Load this pact or create one fresh production pact.
5. Verify at least one production read/write/auto-refresh flow.
6. Only then mark Vercel production PASS.
```
