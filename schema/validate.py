#!/usr/bin/env python3
"""Persival extended-trace validator (Phase 0c).

Validates a trace against schema/trace.schema.json (structure) and then runs the
referential-integrity checks that JSON Schema cannot express cleanly (cross-references
between memory_ops, memory_items, memory_stores, sessions, and action labels), plus a
uniqueness check (h) over each identity namespace.

Usage:
    python schema/validate.py <path>

    <path> is either a single-trace .json file (one trace object) or a .jsonl file
    (one independent trace per line). The kind is inferred from the extension; override
    with --json / --jsonl.

Exit code 0 iff every trace is structurally valid AND passes all referential checks;
non-zero otherwise. Only third-party dependency is `jsonschema`.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

try:
    from jsonschema import Draft202012Validator
except ImportError:  # pragma: no cover - dependency guard
    sys.stderr.write(
        "error: this validator requires the 'jsonschema' package "
        "(pip install jsonschema)\n"
    )
    sys.exit(2)

SCHEMA_PATH = Path(__file__).with_name("trace.schema.json")

MUTATING_OPS = {"write", "update", "delete", "transform"}


# --------------------------------------------------------------------------- #
# Structural validation                                                        #
# --------------------------------------------------------------------------- #
def structural_errors(validator: Draft202012Validator, trace: Any) -> list[str]:
    """Return every JSON-Schema violation, each as 'path: message'."""
    errors = []
    for err in sorted(validator.iter_errors(trace), key=lambda e: list(e.absolute_path)):
        location = "/".join(str(p) for p in err.absolute_path) or "<root>"
        errors.append(f"{location}: {err.message}")
    return errors


# --------------------------------------------------------------------------- #
# Referential-integrity checks (what JSON Schema cannot express cleanly)       #
# --------------------------------------------------------------------------- #
def _classify_turn_object(obj: dict) -> str:
    """Object type is determined by the `label` PREFIX (SCHEMA.md 4.5): human_input_* vs
    action_*. NOT by the presence of agent_label/memory_ops. An object whose label is
    absent or carries neither prefix is 'unknown' (a malformed turn object; its shape is
    caught structurally by the positional prefixItems constraint)."""
    label = obj.get("label")
    if isinstance(label, str):
        if label.startswith("human_input_"):
            return "human_input"
        if label.startswith("action_"):
            return "action"
    return "unknown"


def referential_errors(trace: dict) -> list[str]:
    """Run checks (a)-(g) from the task spec and return ALL failures found.

    Written defensively: a trace that fails structural validation may still be run
    through here, so every access is guarded and never raises on shape.
    """
    errors: list[str] = []

    if not isinstance(trace, dict):
        return ["<root>: trace is not a JSON object; skipping referential checks"]

    components = trace.get("components") or {}
    stores = components.get("memory_stores") or []
    items = trace.get("memory_items") or []
    sessions = trace.get("sessions") or []
    actions = trace.get("actions") or []

    # Reference sets ------------------------------------------------------- #
    store_labels = {
        s.get("label") for s in stores if isinstance(s, dict) and "label" in s
    }
    item_ids = {
        it.get("item_id") for it in items if isinstance(it, dict) and "item_id" in it
    }
    session_ids = {
        s.get("session_id")
        for s in sessions
        if isinstance(s, dict) and "session_id" in s
    }

    action_labels: set[str] = set()
    for turn in actions:
        if not isinstance(turn, list):
            continue
        for obj in turn:
            if isinstance(obj, dict) and _classify_turn_object(obj) == "action":
                if "label" in obj:
                    action_labels.add(obj["label"])

    # (f) session_id on every action and human_input ---------------------- #
    for t_idx, turn in enumerate(actions):
        if not isinstance(turn, list):
            continue
        for o_idx, obj in enumerate(turn):
            if not isinstance(obj, dict):
                continue
            kind = _classify_turn_object(obj)
            where = f"actions[{t_idx}][{o_idx}] ({kind} '{obj.get('label', '?')}')"
            sid = obj.get("session_id")
            if sid is None:
                errors.append(f"(f) {where}: missing session_id")
            elif sid not in session_ids:
                errors.append(
                    f"(f) {where}: session_id '{sid}' does not resolve to any sessions[].session_id"
                )

    # (a) MemoryOp.store_label -> declared store; (b) item_ids -> declared items;
    # (g) actor is never external_input ----------------------------------- #
    for t_idx, turn in enumerate(actions):
        if not isinstance(turn, list):
            continue
        for o_idx, obj in enumerate(turn):
            if not isinstance(obj, dict) or _classify_turn_object(obj) != "action":
                continue
            action_label = obj.get("label", f"actions[{t_idx}][{o_idx}]")
            for op_idx, op in enumerate(obj.get("memory_ops") or []):
                if not isinstance(op, dict):
                    continue
                where = f"action '{action_label}'.memory_ops[{op_idx}] (op '{op.get('op', '?')}')"

                store_label = op.get("store_label")
                if store_label is not None and store_label not in store_labels:
                    errors.append(
                        f"(a) {where}: store_label '{store_label}' does not resolve to any memory_stores[].label"
                    )

                for iid in op.get("item_ids") or []:
                    if iid not in item_ids:
                        errors.append(
                            f"(b) {where}: item_id '{iid}' does not exist in memory_items[]"
                        )

                actor = op.get("actor")
                if actor == "external_input":
                    errors.append(
                        f"(g) {where}: actor is 'external_input', which is forbidden for a memory op actor"
                    )

    # (c) item.store_label -> declared store; (d) provenance origin_action /
    # origin_session resolve; (e) derived_from items exist ----------------- #
    for i_idx, item in enumerate(items):
        if not isinstance(item, dict):
            continue
        item_label = item.get("item_id", f"memory_items[{i_idx}]")
        where = f"memory_item '{item_label}'"

        store_label = item.get("store_label")
        if store_label is not None and store_label not in store_labels:
            errors.append(
                f"(c) {where}: store_label '{store_label}' does not resolve to any memory_stores[].label"
            )

        prov = item.get("provenance") or {}
        if isinstance(prov, dict):
            origin_action = prov.get("origin_action")
            if origin_action is not None and origin_action not in action_labels:
                errors.append(
                    f"(d) {where}.provenance: origin_action '{origin_action}' does not resolve to any action label"
                )

            origin_session = prov.get("origin_session")
            if origin_session is not None and origin_session not in session_ids:
                errors.append(
                    f"(d) {where}.provenance: origin_session '{origin_session}' does not resolve to any sessions[].session_id"
                )

            for parent in prov.get("derived_from") or []:
                if parent not in item_ids:
                    errors.append(
                        f"(e) {where}.provenance: derived_from id '{parent}' does not exist in memory_items[]"
                    )

    return errors


# --------------------------------------------------------------------------- #
# Uniqueness checks (identity namespaces; not expressible in JSON Schema)      #
# --------------------------------------------------------------------------- #
def uniqueness_errors(trace: dict) -> tuple[list[str], list[str]]:
    """Check (h): identity-namespace uniqueness. A duplicate silently collapses
    referential links, so it must be caught here (JSON Schema cannot express
    cross-array uniqueness).

    Returns (errors, warnings):
      * INTRA-namespace duplicates are ERRORS (fatal) — the same label/id appearing
        twice in one namespace breaks the "node.id === label" identity contract.
      * CROSS-namespace collisions are WARNINGS (non-fatal). Each reference field
        targets exactly one namespace (op.store_label -> stores, op.item_ids ->
        items, provenance.origin_session -> sessions, provenance.origin_action ->
        action labels), so a string reused across namespaces does NOT actually
        collapse any reference. It is reported as an authoring smell, not an error.
        POLICY FLAGGED FOR REVIEW — see the deliverable note.
    """
    errors: list[str] = []
    warnings: list[str] = []
    if not isinstance(trace, dict):
        return errors, warnings

    components = trace.get("components") or {}
    stores = components.get("memory_stores") or []
    items = trace.get("memory_items") or []
    sessions = trace.get("sessions") or []
    actions = trace.get("actions") or []

    def collect(pairs) -> dict:
        d: dict = defaultdict(list)
        for val, where in pairs:
            d[val].append(where)
        return d

    store_occ = collect(
        (s.get("label"), f"memory_stores[{i}]")
        for i, s in enumerate(stores)
        if isinstance(s, dict) and "label" in s
    )
    item_occ = collect(
        (it.get("item_id"), f"memory_items[{i}]")
        for i, it in enumerate(items)
        if isinstance(it, dict) and "item_id" in it
    )
    session_occ = collect(
        (s.get("session_id"), f"sessions[{i}]")
        for i, s in enumerate(sessions)
        if isinstance(s, dict) and "session_id" in s
    )
    label_pairs = []
    for t_idx, turn in enumerate(actions):
        if not isinstance(turn, list):
            continue
        for o_idx, obj in enumerate(turn):
            if isinstance(obj, dict) and "label" in obj:
                label_pairs.append((obj["label"], f"actions[{t_idx}][{o_idx}]"))
    label_occ = collect(label_pairs)

    namespaces = [
        ("memory_stores[].label", store_occ),
        ("memory_items[].item_id", item_occ),
        ("sessions[].session_id", session_occ),
        ("action/human_input label", label_occ),
    ]

    # Intra-namespace duplicates -> errors, listing every occurrence.
    for name, occ in namespaces:
        for val, wheres in occ.items():
            if len(wheres) > 1:
                errors.append(
                    f"(h) duplicate {name} '{val}' appears {len(wheres)} times "
                    f"at {', '.join(wheres)}"
                )

    # Cross-namespace collisions -> warnings.
    for i in range(len(namespaces)):
        for j in range(i + 1, len(namespaces)):
            n1, occ1 = namespaces[i]
            n2, occ2 = namespaces[j]
            shared = {v for v in occ1 if v is not None} & {v for v in occ2 if v is not None}
            for val in sorted(shared):
                warnings.append(
                    f"(h-x) identifier '{val}' is used in both {n1} and {n2} — "
                    f"distinct namespaces, not fatal, but a possible authoring smell"
                )

    return errors, warnings


# --------------------------------------------------------------------------- #
# Driver                                                                       #
# --------------------------------------------------------------------------- #
def validate_trace(
    validator: Draft202012Validator, trace: Any, label: str
) -> tuple[list[str], list[str]]:
    """Validate one trace; return (problems, warnings).

    problems = structural + referential + uniqueness failures (fatal).
    warnings = non-fatal advisories (currently cross-namespace id collisions).
    """
    problems = [f"[structural] {e}" for e in structural_errors(validator, trace)]
    problems += [f"[referential] {e}" for e in referential_errors(trace)]
    uniq_errors, uniq_warnings = uniqueness_errors(trace if isinstance(trace, dict) else {})
    problems += [f"[uniqueness] {e}" for e in uniq_errors]
    warnings = [f"[uniqueness] {w}" for w in uniq_warnings]
    return problems, warnings


def load_traces(path: Path, mode: str) -> list[tuple[str, Any]]:
    """Return a list of (label, trace-object) pairs."""
    if mode == "jsonl":
        traces = []
        with path.open(encoding="utf-8") as fh:
            for lineno, line in enumerate(fh, start=1):
                line = line.strip()
                if not line:
                    continue
                traces.append((f"line {lineno}", json.loads(line)))
        return traces
    with path.open(encoding="utf-8") as fh:
        return [("trace", json.load(fh))]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Validate a Persival extended trace against trace.schema.json plus referential integrity."
    )
    parser.add_argument("path", help="Path to a .json trace or a .jsonl file (one trace per line).")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--json", action="store_const", dest="mode", const="json",
                       help="Force single-trace JSON mode.")
    group.add_argument("--jsonl", action="store_const", dest="mode", const="jsonl",
                       help="Force line-delimited JSONL mode.")
    args = parser.parse_args(argv)

    path = Path(args.path)
    if not path.is_file():
        sys.stderr.write(f"error: no such file: {path}\n")
        return 2

    mode = args.mode or ("jsonl" if path.suffix.lower() == ".jsonl" else "json")

    with SCHEMA_PATH.open(encoding="utf-8") as fh:
        schema = json.load(fh)
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema)

    try:
        traces = load_traces(path, mode)
    except json.JSONDecodeError as exc:
        sys.stderr.write(f"error: could not parse {path} as {mode}: {exc}\n")
        return 2

    total_failures = 0
    total_warnings = 0
    for label, trace in traces:
        problems, warnings = validate_trace(validator, trace, label)
        total_warnings += len(warnings)
        if problems:
            total_failures += len(problems)
            print(f"FAIL  {path} :: {label}  ({len(problems)} problem(s))")
            for p in problems:
                print(f"    - {p}")
        else:
            print(f"OK    {path} :: {label}")
        for w in warnings:
            print(f"    ! WARNING {w}")

    print()
    n = len(traces)
    warn_note = f" ({total_warnings} warning(s))" if total_warnings else ""
    if total_failures:
        print(f"RESULT: {total_failures} problem(s) across {n} trace(s) in {path}{warn_note}")
        return 1
    print(f"RESULT: all {n} trace(s) valid in {path}{warn_note}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
