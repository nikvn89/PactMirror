# PactMirror v1.1 — Submission Note

PactMirror evaluates whether one declared bilateral right is granted to two declared roles under the same conditions. Party A creates a PENDING pact and nominates Party B; Party B must accept on-chain before semantic submissions are allowed. GenLayer validators return only `RIGHT_MIRRORED` or `RIGHT_NOT_MIRRORED`. A mirrored verdict deterministically arms a shared one-shot right that either party may exercise.

Version 1.1 rejects malformed semantic output without consuming an attempt, normalizes term whitespace before content-addressing, retains the five-attempt append-only limit, and exposes confirmed leader rollback reasons only after accepted-state refresh times out.

## Runtime status

The exact v1.1 Project source is deployed at `0xCd04E73447ab2210B5BbACa38b5F0F6717887275`. Deployment transaction `0xfbba468222ae497caf25ba3ca7ef9a9daf7f70ac1e106277d72d6b9b4236294f` reached GenVM `SUCCESS`, consensus `Accepted`, and finalized state. The Project address is distinct from the separate Intelligent Contract submission address.

A production two-wallet happy path passed on that Project deployment: Party A created a `PENDING` pact, Party B accepted it into `DRAFT`, Party A submitted a term that reached `RIGHT_MIRRORED` and `ACTIVE` in one attempt, and Party A exercised the shared one-shot right into `EXITED`. Exact transaction hashes are recorded in `TESTING.md`. The broader negative and M1–M5 matrix remains explicitly marked `NOT RUN` rather than being claimed as runtime evidence.
