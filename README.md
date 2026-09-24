# PactMirror v1.1

**Project dApp:** PactMirror  
**Intelligent Contract:** ReciprocityLock  
**Network:** GenLayer StudioNet, chain 61999  
**Contract runtime:** py-genlayer v0.2

> **Honest limitation.** PactMirror checks exactly one declared bilateral right in submitted text: whether that right is granted to both declared roles under the same conditions. It does not judge overall fairness, commercial balance, legal enforceability, real-world identity, or whether an off-chain agreement was actually terminated. `EXITED` is contract state only.

The mirrored right in V1 is **shared and one-shot**: the first successful `exercise_right` ends the pact for both parties. This consequence shape is appropriate for a terminating right; it would mis-model independently repeatable rights such as audit or inspection rights.

The rubric is public through `get_rubric`, so semantic grinding is not a closed problem. A creator can aim at the rubric within the five-attempt cap. The deterrents are the small cap, permanent attempt history, and the fact that a successful mirrored term also arms the counterparty with the same one-shot right.

At an assumed independent model error rate of 10%, five attempts give a probability of at least one erroneous mirrored result of `1 - 0.9^5 ≈ 0.41`. The attempt cap reduces exposure but does not eliminate semantic grinding.

## What changed in v1.1

- Party B must call `accept_pact` before Party A can submit a term.
- Invalid or malformed model output aborts instead of being recorded as `RIGHT_NOT_MIRRORED`.
- Term whitespace is collapsed before hashing, so spacing-only variants share one `term_id`.
- The frontend checks the leader rollback reason once, only after accepted-state refresh times out.
- The semantic test plan uses the balanced M1–M5 suite instead of the earlier keyword-separable examples.

## Consent and party model

`create_pact` only nominates Party B. The pact begins in `PENDING`; this is not presented as bilateral consent. Party B must submit a separate `accept_pact(pact_id)` transaction. Only after that accepted transaction does the pact enter `DRAFT` and permit semantic submissions.

This records two wallet actions but does not prove that the wallets belong to independent humans or organizations. One person can still control both wallets. The contract therefore proves address-level participation, not real-world identity.

## State machine

```text
PENDING -- accept_pact by Party B --> DRAFT

DRAFT -- RIGHT_NOT_MIRRORED --> DRAFT
DRAFT -- RIGHT_MIRRORED     --> ACTIVE

ACTIVE -- exercise_right by Party A or Party B --> EXITED
```

`exercise_right` remains a deterministic, one-shot consequence. Either declared party may call it after a mirrored term becomes active.

## AI boundary

Validators return exactly one of:

```text
RIGHT_MIRRORED
RIGHT_NOT_MIRRORED
```

`RIGHT_MIRRORED` means the declared right is granted to both declared roles under the same conditions. `RIGHT_NOT_MIRRORED` covers a missing right, different conditions, or an additional independent route for one role.

The AI does not authorize callers, mutate IDs, select a party, count attempts, or choose the state transition. All of those effects are deterministic contract code.

## Authorization

| Method | Authorized caller | Additional condition |
|---|---|---|
| `create_pact` | Any wallet | Party B must be nonzero and different |
| `accept_pact` | Nominated Party B | Pact must still be pending |
| `submit_term` | Party A / creator | Party B accepted; pact is DRAFT; fewer than 5 attempts |
| `exercise_right` | Party A or Party B | A mirrored term is active |

There is no global admin, deployer privilege, clock, token, or external web source.

## Anti-replay and failure safety

- exact term replay is rejected by content-addressed `term_id`;
- all Python whitespace runs collapse to one ASCII space before hashing;
- at most five converged terms are recorded per pact;
- every converged attempt is append-only;
- a mirrored term closes further submission;
- invalid semantic JSON or an unknown label raises `Invalid semantic output` and rolls back, so no attempt is consumed and the term can be retried;
- reserved prompt markers and verdict tokens are rejected, not sanitized.

## Frontend trust model

The frontend never calculates semantic verdicts or authoritative pact state. It submits writes, shows the returned transaction hash as submitted, and reads accepted contract state through the same-origin `/api/rpc` proxy.

After a write, it refreshes accepted state every 15 seconds without receipt polling or automatic resubmission. If that process times out, it performs one leader-receipt lookup to surface a confirmed rollback reason. A missing rollback reason is treated as an unresolved/slow transaction, not as success or failure.

## Local ID formulas

Pact names use Python-compatible `str.strip()` semantics. Terms use Python-compatible `" ".join(value.split())` semantics. The frontend mirrors both behaviors in `src/ids.ts`, and `tools/id-parity.mjs` checks representative edge cases.

## Development

```bash
npm ci
npm run build
node tools/id-parity.mjs
python3 tools/pm_kill.py contracts/ReciprocityLock.py
```

Copy `.env.example` to `.env` only when overriding defaults.

## StudioNet v1.1 Project deployment

```text
Contract:
0xCd04E73447ab2210B5BbACa38b5F0F6717887275

Deploy transaction:
0xfbba468222ae497caf25ba3ca7ef9a9daf7f70ac1e106277d72d6b9b4236294f

Explorer:
https://explorer-studio.genlayer.com/address/0xCd04E73447ab2210B5BbACa38b5F0F6717887275
```

Observed deployment status: GenVM `SUCCESS`, consensus `Accepted`. The accepted `get_config` response reports version `1.1` and the `PENDING`, `DRAFT`, `ACTIVE`, and `EXITED` state labels.

The separate Intelligent Contract submission uses `0x8F84adB020C953a1415Cc4ac5eF2617Ec97DBb12`. The frontend deliberately points only to the distinct Project address above.

The former project address and runtime screenshots are historical v1.0 evidence only:

```text
0x1613A25aE378b3e1e82e4840733BDED53b19f1a8
```

The former standalone address is also v1.0 evidence only:

```text
0x478942A99631cB3357f4480210AF9c5a9bc8c3C2
```

See `TEST_PLAN.md` for the remaining runtime workflow and `TESTING.md` for results that have actually been observed.
