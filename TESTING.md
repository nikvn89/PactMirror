# PactMirror v1.1 — Test Results

## Final status

| Gate | Result |
|---|---|
| Python source compilation | **PASS** |
| Contract invariant checks | **PASS — 12/12** |
| M1–M5 shortcut analysis | **PASS** |
| Frontend ID parity | **PASS — pact 12/12, term 7/7** |
| `npm ci` | **PASS — 286 packages** |
| `npm run build` | **PASS — 478 modules** |
| v1.1 Project deployment | **PASS — GenVM SUCCESS, consensus Accepted and Finalized** |
| v1.1 consent flow | **NOT RUN** |
| v1.1 M1–M5 semantic runtime | **NOT RUN** |
| v1.1 signed long-write runtime | **NOT RUN** |
| v1.1 production/Vercel runtime | **NOT RUN** |

This document reports only observed results. Procedures and expected outcomes are in `TEST_PLAN.md`.

## Source under test

```text
Contract: contracts/ReciprocityLock.py
Version: 1.1
SHA-256: see CONTRACT_SHA256.txt
```

## Local build and static checks

The following commands were run against this exact package:

```bash
python3 -m py_compile contracts/ReciprocityLock.py
python3 tools/verify_contract.py contracts/ReciprocityLock.py
python3 tools/pm_kill.py contracts/ReciprocityLock.py
npm ci
node tools/id-parity.mjs
npm run build
```

Observed:

```text
contract SHA-256: f98b294afb5fc1122af2b7678fef9f8b25bcb4a481df48626d0ca5d41ec6e3d9
contract invariants: 12/12 PASS
M1–M5 single-token separators: none
M1–M5 single-bigram separators: none
maximum rubric-line Jaccard similarity: 0.111
pact ID parity: 12/12 reachable
term ID parity: 7/7 reachable
npm ci: rc 0, 286 packages
npm run build: rc 0, 478 modules
```

## Runtime evidence for v1.1

The exact v1.1 source was deployed to StudioNet:

```text
Contract: 0xCd04E73447ab2210B5BbACa38b5F0F6717887275
Deploy tx: 0xfbba468222ae497caf25ba3ca7ef9a9daf7f70ac1e106277d72d6b9b4236294f
GenVM result: SUCCESS
Consensus result: Accepted
```

The accepted `get_config` read reports version `1.1` and includes the `PENDING` state plus the `accept_pact` write method.

### Observed production happy path — PASS

The production frontend completed a two-wallet run against the v1.1 Project address:

```text
Pact ID: a4adc85f39492f29d209b45b01d7e62f154532383d488a438b12de34f3e6560e
Party A: 0x6276095FAE...8c304657F4
Party B: 0x037f58E33c...31054a1CDE
Accepted sequence: PENDING -> DRAFT -> ACTIVE -> EXITED
Semantic result: RIGHT_MIRRORED
Attempt count: 1/5
Exited by: Party A
```

| Step | Accepted transaction | Observed result |
| --- | --- | --- |
| Create pact | `0xe3ba708e26c57dea01f215bb01c20251cede2121252876eda487ca1196880dcf` | `PENDING`, awaiting Party B |
| Party B accepts | `0xa5624e9701e185e364a0623a69ce153c5881d01ff0c670f8464ace5a043d0b95` | `DRAFT`, submissions unlocked for Party A |
| Submit mirrored term | `0xb46ad4ccde0a8dee29e22b0148480ea37362f286e942d68608c63da173305d7e` | `RIGHT_MIRRORED`, `ACTIVE`, attempt `1/5` |
| Exercise shared right | `0x156d2e18004a42ed9860d10efc7a732b8704031e1ef55a15832caa12b3889960` | `EXITED`, shared right marked used |

The tested term was:

```text
Both Provider and Customer may terminate the hosting agreement by giving thirty days written notice, under exactly the same conditions.
```

The frontend displayed accepted-state auto-refresh after creation and Party B acceptance, loaded the authoritative `ACTIVE` result, and then loaded the final `EXITED` state.

### Remaining extended paths — NOT RUN

- negative authorization cases;
- M1–M5 across three pacts;
- deterministic exercise before and after activation;
- invalid semantic output rollback behavior;
- spacing-only replay rejection;
- signed long write over the historical serialization boundary;
- rollback-reason surfacing after accepted-state timeout.

## Historical v1.0 evidence — not v1.1 proof

The included screenshots were captured against the former v1.0 project deployment:

```text
0x1613A25aE378b3e1e82e4840733BDED53b19f1a8
```

They show the earlier DRAFT → ACTIVE → EXITED flow and accepted-state refresh. They do not prove `accept_pact`, invalid-output rollback, whitespace normalization, or the M1–M5 suite introduced for v1.1.

The former standalone deployment was:

```text
0x478942A99631cB3357f4480210AF9c5a9bc8c3C2
```

Its earlier semantic examples were keyword-separable and are intentionally retired from the v1.1 test suite. They are not counted as v1.1 semantic PASS evidence.

## Evidence discipline

- A transaction hash proves submission, not accepted state.
- A calldata-size measurement is not a signed GenVM execution.
- An expected verdict is not an observed verdict.
- A previous deployment is not evidence for modified source.
- Any future PASS entry must include the exact address and transaction hash.
