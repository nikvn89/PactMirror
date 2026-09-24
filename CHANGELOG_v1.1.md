# PactMirror v1.1 — Feedback Resolution

| Feedback item | Resolution | Primary locations |
|---|---|---|
| Invalid semantic output fabricated a verdict | Malformed/non-object/unknown output now raises `Invalid semantic output`; no attempt or term is committed | `contracts/ReciprocityLock.py:340–353` |
| Spacing-only variants consumed attempts | Contract collapses Python whitespace; frontend and parity tool use matching `pyCollapse` | `contracts/ReciprocityLock.py:187`, `src/ids.ts:21–43`, `tools/id-parity.mjs` |
| Rollbacks disappeared after accepted-state timeout | One leader-receipt lookup runs only after timeout and surfaces a confirmed rollback reason | `src/genlayer.ts:252`, `src/App.tsx:232` |
| Party B had no on-chain consent | New `accept_pact` gate and `PENDING` state; submit remains locked until Party B accepts | `contracts/ReciprocityLock.py:494–528`, `src/App.tsx:363–378` |
| Semantic suite was keyword-separable | Replaced documentation/test analysis with M1–M5; zero single-token and single-bigram separators | `TEST_PLAN.md`, `tools/pm_kill.py` |
| Test document contradicted itself | Expected procedures moved to `TEST_PLAN.md`; `TESTING.md` contains observed results only | `TEST_PLAN.md`, `TESTING.md` |
| Internal review references were public | Removed source/document references and replaced them with standalone technical explanations | `src/genlayer.ts:83`, `TESTING.md` |
| Long calldata claim exceeded evidence | Signed long-write status is explicitly `NOT RUN`; size measurement is not called runtime proof | `TEST_PLAN.md`, `TESTING.md` |

The line numbers above refer to the packaged v1.1 source and may shift after later edits.
