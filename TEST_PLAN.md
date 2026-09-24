# PactMirror v1.1 — Runtime Test Plan

This file contains expected procedures only. Observed results and transaction hashes belong in `TESTING.md`.

## Preconditions

- Deploy the exact source whose SHA-256 appears in `CONTRACT_SHA256.txt`.
- Configure the frontend with the new v1.1 address.
- Use two separate wallets: Party A / creator and Party B.
- Record the deployment address, deployment transaction, pact IDs, term IDs, and every transaction hash.

## Consent and authorization flow

1. Party A calls `create_pact`; expected state: `PENDING`, `accepted = false`.
2. Party A attempts `submit_term`; expected rollback: `Party B must accept the pact first`.
3. An unrelated wallet attempts `accept_pact`; expected rollback: `Only Party B may accept the pact`.
4. Party B calls `accept_pact`; expected state: `DRAFT`, `accepted = true`, `attempt_count = 0`.
5. Party B calls `accept_pact` again; expected rollback: `Pact has already been accepted`.

## Semantic kill suite

Use:

```text
role_a_label = Controller
role_b_label = Processor
right_label  = withdrawal from the arrangement on sixty days notice
```

| ID | Term text | Expected verdict |
|---|---|---|
| M1 | The Controller may withdraw from this arrangement on sixty days notice, and the Processor is free to do the same. | `RIGHT_MIRRORED` |
| M2 | The Controller may withdraw from this arrangement on sixty days notice, and the Processor may do the same with the Controller's prior written consent. | `RIGHT_NOT_MIRRORED` |
| M3 | The Controller may withdraw from this arrangement on sixty days notice, and the Processor may do the same; the Processor must also keep an access log for six years. | `RIGHT_MIRRORED` |
| M4 | Neither the Controller nor the Processor may withdraw from this arrangement before the fixed term ends. | `RIGHT_NOT_MIRRORED` |
| M5 | The Processor may withdraw from this arrangement on sixty days notice, and the Controller has the same right or may withdraw at once on any audit failure. | `RIGHT_NOT_MIRRORED` |

Run across three accepted pacts because a mirrored verdict activates the pact and closes further submission:

```text
pact #1: M2, M4, M5
pact #2: M1, then exercise_right
pact #3: M3
```

Record actual outputs even if they differ from expectations. M3 and M4 are specifically designed to expose surface-symmetry and keyword shortcuts.

## Deterministic teeth

- Call `exercise_right` on an accepted DRAFT pact; expected rollback: `No mirrored term is active`.
- After M1 or M3 returns `RIGHT_MIRRORED`, call `exercise_right` from Party B; expected state: `EXITED` and `exited_by = Party B`.
- Attempt a second exercise; expected rollback: `Pact has already exited`.

## Invalid semantic output safety

This path requires a controlled runtime or mocked `exec_prompt` result.

For malformed JSON, non-object JSON, a missing `verdict`, or an unknown label, verify:

```text
transaction rolls back with Invalid semantic output
attempt_count does not increase
no TermRecord is stored
the exact same normalized term can be retried
```

## Whitespace normalization

Submit one term, then retry the same content with doubled spaces, tabs, or newlines. The contract should normalize all variants to the same text and reject the retry as `Term already exists` without increasing `attempt_count`.

## Long write

Run a signed `submit_term` with normalized text longer than 151 characters on the new address. Record the complete text and transaction hash. Calldata-size measurement alone is not runtime proof that GenVM decoded and executed the write.

## Frontend behavior

- PENDING state visibly offers `Accept pact` only to Party B.
- Submit is disabled until accepted state reaches DRAFT.
- Writes are never auto-resubmitted.
- Accepted state remains the primary confirmation source.
- After refresh timeout, one leader-receipt lookup surfaces a confirmed rollback reason and then stops.
- Vercel read, write, acceptance, semantic submission, and exercise must each be observed before any production PASS is recorded.
