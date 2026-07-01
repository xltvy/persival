# SCHEMA.md — Extended native trace (Persival, Experiment 1)

**Schema version 1.0.** Additive over AgentSeer's native trace `{ components, actions, actions_edge }`. This document specifies *structure* — keys, types, nesting, cardinality, and how the additive keys sit alongside the existing ones. **Term meanings are defined in `GLOSSARY.md` and are not repeated here** (locus, substrate, the operation verbs, actor vs `content_origin`, provenance, lineage, etc.). Where this document names an enum value, its meaning is the glossary's.

---

## 1. Scope & relationship to other artefacts

- **Canonical artefact:** the native trace — `agentseer/AgentSeer/public/detailed_graph_langgraph_multi_trace.json` in the app, JSONL from the adapter in the pipeline. Persival extends this.
- **Out of scope here:** the pre-laid-out ReactFlow file (`reactflow_graph_*.json`) — a derived file carrying node geometry and illustrative demo metrics. Nothing in this spec describes layout.
- **Vocabulary:** `GLOSSARY.md` is authoritative for all value semantics.

---

## 2. Design rules (why the shape is what it is)

1. **Additive.** Every existing key and field is preserved unchanged. New keys are *added*; nothing is removed or repurposed. A consumer of the unextended trace still works.
2. **Geometry-free.** The trace never carries positions or layout. Where and how nodes are drawn is entirely a rendering concern — any consumer that displays the graph computes the layout itself — so the trace describes only what happened, never how to draw it.
3. **Derived edges — not authored.** `operates_on`, `derives_from`, and `resides_in` are *views* projected from `memory_ops` and `memory_items`; the trace itself contains no `memory_edges` array. A trace records ops and items, and any consumer that needs the edges computes them (§5).
4. **Content lives in operations; items are a registry.** `memory_items[]` records identity, provenance, status, and location — not content. An item's content and its evolution are captured in the `before_after` of the ops that touched it, and its current content is a derived value: the result of the latest mutating op on that item.
5. **Versioned.** `schema_version` at top level; changes are additive within a major version.

---

## 3. Top-level shape

```jsonc
{
  "schema_version": "1.0",                          // NEW
  "components": {
    "agents":            [ /* existing */ ],
    "tools":             [ /* existing */ ],
    "short_term_memory": [ /* existing — retained, superseded by memory_stores */ ],
    "long_term_memory":  [ /* existing — retained, superseded by memory_stores */ ],
    "memory_stores":     [ MemoryStore ]            // NEW (authoritative store list)
  },
  "sessions":      [ Session ],                     // NEW
  "memory_items":  [ MemoryItem ],                  // NEW (top-level; items span sessions)
  "actions":       [ [ HumanInput | Action ] ],     // EXISTING structure; Action gains 2 keys
  "actions_edge":  [ [ ActionEdge ] ],              // EXISTING, unchanged (legacy)
  "snapshots":     [ Snapshot ]                     // NEW, OPTIONAL (§4.8)
}
```

`actions` keeps its **array-of-arrays** shape: each inner array is one **turn** (a `human_input_*` followed by the `action_*` it spawned). Sessions are a coarser grouping layered on top via `session_id` (§4.3), not a change to this structure.

---

## 4. New & extended structures

### 4.1 `schema_version` — *string, required*

The spec version this trace conforms to, e.g. `"1.0"`.

### 4.2 `components.memory_stores[]` — the generalised store list (authoritative)

| Field | Type | Req | Notes |
|---|---|---|---|
| `label` | string | ✓ | Unique; the referential id used by ops and items. |
| `name` | string | ✓ | Human/native store name. |
| `locus` | enum | ✓ | `in_context` \| `out_of_context` \| `intrinsic`. |
| `substrate` | enum | ✓ | `text` \| `graph` \| `activation` \| `parametric`. |
| `persistence` | enum | ✓ | `session` \| `persistent` \| `transient`. |
| `scope` | enum | ✓ | `agent_scoped` \| `shared`. |
| `retrieval_method` | enum | ✓ | `vector` \| `graph` \| `exact` \| `none`. Store default. |
| `agent` | string | cond. | Owning agent **name**. **Required iff `scope = agent_scoped`; forbidden when `scope = shared`.** |

The existing `short_term_memory` / `long_term_memory` arrays are **retained** (additivity) as the pre-extension representation. In an extended trace, `memory_stores` is authoritative and each legacy entry corresponds to exactly one `memory_stores` entry (the degenerate case); the frontend renders memory components from `memory_stores`.

### 4.3 `sessions[]` — the session index

| Field | Type | Req | Notes |
|---|---|---|---|
| `session_id` | string | ✓ | Unique. Referenced by actions and items. |
| `order` | integer | ✓ | Session sequence (0-based). |
| `label` | string | — | Human label (e.g. `"injection"`, `"trigger"`). |
| `metadata` | object | — | Free-form. |

### 4.4 `memory_items[]` — the item registry (content-free)

| Field | Type | Req | Notes |
|---|---|---|---|
| `item_id` | string | ✓ | **Stable across sessions** — the cross-session join key. |
| `store_label` | string | ✓ | → `memory_stores.label`; the `resides_in` target. |
| `status` | enum | ✓ | `active` \| `invalidated` \| `evicted` \| `expired`. |
| `provenance` | object | ✓ | See below. |

`provenance`:

| Field | Type | Req | Notes |
|---|---|---|---|
| `origin_action` | string | ✓ | → the `action` label that created the item. |
| `origin_session` | string | ✓ | → `sessions.session_id`. |
| `content_origin` | enum | ✓ | `reasoning_agent` \| `memory_controller` \| `external_input`. |
| `derived_from` | string[] | ✓ | `item_id`s this item derives from; `[]` if none. |

No `content` field — see §2.4 and §8.

### 4.5 Action object — existing fields **plus** two new keys

Existing fields split into two categories:

- **`label` — the identity and linking key — is REQUIRED.** All linking is by label (`node.id === label`; see `GLOSSARY.md`): object-type discrimination and every referential check depend on it, so it is not optional. `label` is *not* an upstream payload field — it is the schema's identity/linking spine.
- **The upstream LangChain payload fields are present-in-practice but NOT schema-enforced:** `input` (LangChain message array), `output` (LangChain `LLMResult`), `agent_label`, `agent_name`, `model`, `span_id`, `components_in_input`, `components_in_output`. A thinner real trace missing e.g. `span_id` still validates. This is what "additive" means: we assert the identity spine and the new keys we own, and we do not enforce upstream payload we do not own.

| New / required field | Type | Req | Notes |
|---|---|---|---|
| `label` | string | ✓ | Identity & linking key; must carry the `action_` prefix (see below). |
| `session_id` | string | ✓ | → `sessions.session_id`. |
| `memory_ops` | MemoryOp[] | ✓ | `[]` if the action touched no memory. |

The `human_input` object gains **`session_id`** (required) and likewise **requires `label`** (identity key, `human_input_` prefix); its remaining fields (`time`, `input`) are present-in-practice but not schema-enforced.

**Object-type discrimination is by `label` prefix, not by field presence.** An object in a turn's inner array is a `human_input` iff its `label` begins with `human_input_`, and an `action` iff its `label` begins with `action_`. Because `label` is now required, discrimination always has a value to key on. Consumers and the validator MUST NOT infer type from the presence of `agent_label`/`memory_ops` (a valid action may carry an empty `memory_ops`, and the payload fields are not schema-required).

### 4.6 `MemoryOp` — an entry in `action.memory_ops[]`

| Field | Type | Req | Notes |
|---|---|---|---|
| `op` | enum | ✓ | `write` \| `read` \| `update` \| `delete` \| `transform` \| `noop`. |
| `native_call` | string | ✓ | The backend-specific call name (attribute, not a type). |
| `actor` | enum | ✓ | `reasoning_agent` \| `memory_controller`. **Never `external_input`.** |
| `store_label` | string | ✓ | → `memory_stores.label`; the `operates_on` target. |
| `item_ids` | string[] | ✓ | Items touched. **Enforced: non-empty (`minItems: 1`) for every op except `noop`; may be `[]` only for `noop`.** |
| `retrieval_method` | enum | — | `reads` only; overrides the store default. |
| `before_after` | object | cond. | Required for mutating ops; omitted for `read`/`noop` (§4.7). |
| `native_details` | object | — | Polymorphic backend payload (§4.9). |

### 4.7 `before_after` — the mutation diff

Present on mutating ops (`write`, `update`, `delete`, `transform`); **omitted** for `read` and `noop`. Only the array(s) relevant to the op are populated.

```jsonc
"before_after": {
  "added":   [ { "item_id": "…", "content": "…" } ],                 // write; transform (derived item)
  "updated": [ { "item_id": "…", "before": "…", "after": "…" } ],    // update
  "deleted": [ { "item_id": "…", "content": "…", "new_status": "invalidated" } ] // delete
}
```

In a `deleted` entry, `new_status` ∈ {`invalidated`, `evicted`, `expired`} — a delete/invalidate never sets `active` (this is a narrowing of the item-level `status` enum for this field only; the item-level `status` enum in §4.4 is unchanged).

`content` strings are the human-readable memory content rendered in the details panel. A `read`'s effect is captured by `item_ids` + `retrieval_method`, not `before_after`. A `transform`'s lineage parents live on the **derived item's** `provenance.derived_from`, not here.

### 4.8 `snapshots[]` — optional session-boundary full state

Optional top-level array; a full store item-set at a session boundary, **by item reference** (content stays in the ops). Consumers must not assume presence.

| Field | Type | Req | Notes |
|---|---|---|---|
| `session_id` | string | ✓ | → `sessions.session_id`. |
| `boundary` | enum | ✓ | `start` \| `end`. |
| `store_label` | string | ✓ | → `memory_stores.label`. |
| `item_ids` | string[] | ✓ | Items present in the store at that boundary. |

### 4.9 `native_details` — polymorphic backend payload

Free-form object attached to an op for the details panel. Examples: MemGPT → `{ summary, evicted_message_ids }`; Mem0 → `{ decision: "ADD"|"UPDATE"|"DELETE"|"NOOP", old_fact, new_fact }`; MemOS → the MemCube metadata header. Never graph structure — this is the escape hatch that keeps the graph architecture-neutral.

---

## 5. Derived views (computed by consumers — NOT in the trace)

| View | Derivation | Direction |
|---|---|---|
| `operates_on` | per action, per `memory_op` → edge to `store_label`, typed by `op`, carrying `item_ids` | `write/update/delete/transform`: action→store · `read`: store→action |
| `derives_from` | per `memory_item` with non-empty `provenance.derived_from` → edge(s) to each parent | item → parent item |
| `resides_in` | per `memory_item` → its `store_label` | item → store |

Rendering surfaces these as cross-panel highlighting and the satellite op layer — never as drawn cross-canvas lines (see `GLOSSARY.md`, derived-edge principle).

---

## 6. Worked example — minimal two-session injection

Trimmed but structurally valid. `session_0` injects (a `memory_controller` WRITE persists `external_input`-origin content as `item_A`); `session_1` triggers (a `reasoning_agent` READ of `item_A` shapes an output). Derived views: `operates_on` (action_3→store, write; action_7→store, read) and `resides_in` (item_A→store_ltm_0). A fuller fixture adds a TRANSFORM step to demonstrate laundering.

```jsonc
{
  "schema_version": "1.0",
  "components": {
    "agents": [ { "label": "agent_0", "name": "main_agent", "system_prompt": "…",
                  "tools": [ /* … */ ], "model": "openai/gpt-oss-20b" } ],
    "tools": [ /* … */ ],
    "short_term_memory": [ { "label": "short_term_memory_0", "agent": "main_agent",
                             "short_term_memory": "main_agent_messages" } ],
    "long_term_memory":  [ { "label": "long_term_memory_0",
                             "long_term_memory": "knowledge_base_long_term_memory" } ],
    "memory_stores": [
      { "label": "store_stm_0", "name": "main_agent_messages",
        "locus": "in_context", "substrate": "text", "persistence": "session",
        "scope": "agent_scoped", "retrieval_method": "none", "agent": "main_agent" },
      { "label": "store_ltm_0", "name": "knowledge_base_long_term_memory",
        "locus": "out_of_context", "substrate": "text", "persistence": "persistent",
        "scope": "shared", "retrieval_method": "vector" }
    ]
  },
  "sessions": [
    { "session_id": "session_0", "order": 0, "label": "injection" },
    { "session_id": "session_1", "order": 1, "label": "trigger" }
  ],
  "memory_items": [
    { "item_id": "item_A", "store_label": "store_ltm_0", "status": "active",
      "provenance": { "origin_action": "action_3", "origin_session": "session_0",
                      "content_origin": "external_input", "derived_from": [] } }
  ],
  "actions": [
    [
      { "label": "human_input_0", "time": "2025-08-18_10-13-20.573",
        "input": "…(poisoned turn)…", "session_id": "session_0" },
      { "label": "action_3", "input": [ /* LangChain messages */ ],
        "output": { /* LLMResult */ },
        "agent_label": "agent_0", "agent_name": "main_agent",
        "model": "openai/gpt-oss-20b", "span_id": "…",
        "components_in_input": [], "components_in_output": [ "long_term_memory_0" ],
        "session_id": "session_0",
        "memory_ops": [
          { "op": "write", "native_call": "save_to_knowledge_base_LTM_tool",
            "actor": "memory_controller", "store_label": "store_ltm_0",
            "item_ids": [ "item_A" ],
            "before_after": { "added": [ { "item_id": "item_A",
                                           "content": "…(adversarial content)…" } ] },
            "native_details": { "tool": "save_to_knowledge_base_LTM_tool" } }
        ]
      }
    ],
    [
      { "label": "human_input_1", "time": "2025-08-18_11-02-05.114",
        "input": "…(benign later request)…", "session_id": "session_1" },
      { "label": "action_7", "input": [ /* … */ ], "output": { /* … */ },
        "agent_label": "agent_0", "agent_name": "main_agent",
        "model": "openai/gpt-oss-20b", "span_id": "…",
        "components_in_input": [ "long_term_memory_0" ], "components_in_output": [],
        "session_id": "session_1",
        "memory_ops": [
          { "op": "read", "native_call": "get_information_from_knowledge_base",
            "actor": "reasoning_agent", "store_label": "store_ltm_0",
            "item_ids": [ "item_A" ], "retrieval_method": "vector" }
        ]
      }
    ]
  ],
  "actions_edge": [
    [ { "source": "human_input_0", "target": "action_3" } ],
    [ { "source": "human_input_1", "target": "action_7" } ]
  ]
}
```

---

## 7. Conformance & versioning

- A trace is **valid** iff it satisfies the JSON Schema generated from this spec.
- **Additive evolution** within `1.x`; breaking changes bump the major version.
- **Legacy keys** (`short_term_memory`, `long_term_memory`, `actions_edge`) remain valid but are **superseded** by `memory_stores` and `memory_ops` for the memory layer. `actions_edge.memory_label` is a store-level, unused-by-frontend precursor to `operates_on`; do not build on it.

---

## 8. Design decisions (settled)

1. **Content-in-ops** (§2.4, §4.4) — *adopted.* `memory_items` is a content-free registry; content and its evolution live in ops' `before_after`; current content is derived at render time. Chosen over a denormalised `current_content` field on items, which would render more cheaply but carry a staleness invariant; the normalised form is consistent with capturing state as diffs rather than snapshots.
2. **Snapshots optional** (§4.8) — *adopted.* Boundary full-state snapshots are an optional producer feature; the injection story is fully carried by ops, items, and provenance without them.
3. **Legacy short/long keys retained** (§4.2) — *adopted.* Kept during the transition for additivity; the frontend migrates to `memory_stores`. Not dropped now.

---

## 9. Next

The next artefacts are `schema/trace.schema.json` (a JSON Schema encoding these constraints) and a Python `jsonschema` validator, followed by fixtures that exercise every part of this schema, including a full multi-session injection trace.