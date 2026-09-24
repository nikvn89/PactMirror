#!/usr/bin/env python3
"""Offline shortcut analysis for the PactMirror v1.1 M1-M5 suite."""

from pathlib import Path
import re
import sys

CASES = [
    (
        "M1",
        "The Controller may withdraw from this arrangement on sixty days notice, and the "
        "Processor is free to do the same.",
        "MIRRORED",
    ),
    (
        "M2",
        "The Controller may withdraw from this arrangement on sixty days notice, and the "
        "Processor may do the same with the Controller's prior written consent.",
        "NOT_MIRRORED",
    ),
    (
        "M3",
        "The Controller may withdraw from this arrangement on sixty days notice, and the "
        "Processor may do the same; the Processor must also keep an access log for six years.",
        "MIRRORED",
    ),
    (
        "M4",
        "Neither the Controller nor the Processor may withdraw from this arrangement before "
        "the fixed term ends.",
        "NOT_MIRRORED",
    ),
    (
        "M5",
        "The Processor may withdraw from this arrangement on sixty days notice, and the "
        "Controller has the same right or may withdraw at once on any audit failure.",
        "NOT_MIRRORED",
    ),
]


def words(value: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", value.lower())


def token_set(value: str) -> set[str]:
    return set(words(value))


def separates(feature) -> bool:
    forward = all(
        ("MIRRORED" if feature(text) else "NOT_MIRRORED") == label
        for _, text, label in CASES
    )
    reverse = all(
        ("NOT_MIRRORED" if feature(text) else "MIRRORED") == label
        for _, text, label in CASES
    )
    return forward or reverse


def jaccard(left: set[str], right: set[str]) -> float:
    union = left | right
    return len(left & right) / len(union) if union else 1.0


def main() -> int:
    contract = Path(sys.argv[1] if len(sys.argv) > 1 else "contracts/ReciprocityLock.py")
    source = contract.read_text(encoding="utf-8")
    start = source.index('RUBRIC = f"""')
    end = source.index("@allow_storage", start)
    rubric_lines = [
        token_set(line)
        for line in source[start:end].splitlines()
        if token_set(line)
    ]

    all_tokens = set().union(*(token_set(text) for _, text, _ in CASES))
    all_bigrams = {
        f"{seq[index]} {seq[index + 1]}"
        for _, text, _ in CASES
        for seq in [words(text)]
        for index in range(len(seq) - 1)
    }

    bad_tokens = sorted(
        token for token in all_tokens
        if separates(lambda text, token=token: token in token_set(text))
    )
    bad_bigrams = sorted(
        bigram for bigram in all_bigrams
        if separates(lambda text, bigram=bigram: bigram in " ".join(words(text)))
    )

    similarities = {}
    for case_id, text, _ in CASES:
        current = token_set(text)
        similarities[case_id] = max(jaccard(current, line) for line in rubric_lines)

    both_roles = all(
        "controller" in token_set(text) and "processor" in token_set(text)
        for _, text, _ in CASES
    )
    lengths = [len(text) for _, text, _ in CASES]
    labels = [label for _, _, label in CASES]
    constants_fail = len(set(labels)) == 2

    print("PactMirror v1.1 M1-M5 shortcut analysis")
    print(f"both role names in every case: {'PASS' if both_roles else 'FAIL'}")
    print(f"single-token separators: {bad_tokens or 'none'}")
    print(f"single-bigram separators: {bad_bigrams or 'none'}")
    print("rubric-line Jaccard:", " ".join(f"{key}={value:.3f}" for key, value in similarities.items()))
    print(f"max rubric-line Jaccard: {max(similarities.values()):.3f}")
    print(f"character lengths: {lengths}")
    print(f"constant-label stubs fail: {'PASS' if constants_fail else 'FAIL'}")

    passed = (
        both_roles
        and not bad_tokens
        and not bad_bigrams
        and max(similarities.values()) < 0.40
        and constants_fail
    )
    print(f"RESULT: {'PASS' if passed else 'FAIL'}")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())

