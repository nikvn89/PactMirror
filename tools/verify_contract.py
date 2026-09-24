#!/usr/bin/env python3
"""Static invariants for ReciprocityLock v1.1."""

from pathlib import Path
import ast
import hashlib
import sys


def require(source: str, needle: str, label: str) -> None:
    if needle not in source:
        raise AssertionError(f"missing invariant: {label}")


def main() -> int:
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "contracts/ReciprocityLock.py")
    source = path.read_text(encoding="utf-8")
    ast.parse(source)

    checks = [
        ('class ReciprocityLock(gl.Contract):', "v0.2 contract base"),
        ('def accept_pact(self, pact_id_hex: str)', "Party B acceptance method"),
        ('if gl.message.sender_address != pact.party_b:', "Party B authorization"),
        ('if not pact.accepted:', "pre-submit acceptance gate"),
        ('cleaned = " ".join(value.split())', "term whitespace collapse"),
        ('raise gl.vm.UserError("Invalid semantic output")', "invalid output rollback"),
        ('if sender != pact.creator and sender != pact.party_b:', "two-party exercise"),
        ('MAX_ATTEMPTS_PER_PACT = 5', "five-attempt cap"),
        ('if term_id in self.terms:', "exact replay guard"),
        ('gl.vm.run_nondet_unsafe(', "GenLayer nondeterministic consensus"),
        ('"PENDING"', "pending state exposure"),
        ('"version": "1.1"', "version metadata"),
    ]
    for needle, label in checks:
        require(source, needle, label)

    forbidden = [
        'return {"verdict": RIGHT_NOT_MIRRORED}',
        "self.pacts = TreeMap()",
        "self.terms = TreeMap()",
    ]
    for needle in forbidden:
        if needle in source:
            raise AssertionError(f"forbidden pattern present: {needle}")

    sha = hashlib.sha256(path.read_bytes()).hexdigest()
    print(f"contract: {path}")
    print(f"sha256: {sha}")
    print(f"invariants: {len(checks)}/{len(checks)} PASS")
    print("RESULT: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

