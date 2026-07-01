# GLOSSARY.md — Persival vocabulary bank

Authoritative definitions for the Persival observability extension. This document is the single source of truth for terminology; the schema spec, validator, fixtures, and frontend all use these terms as defined here and never redefine them. If a term is ambiguous in code or discussion, fix it here first.

Each entry gives: **term** — definition · *Schema:* where it appears in the extended native trace · *Not:* the boundary that keeps the term precise (and the schema architecture-neutral).

Two structural facts frame everything:

- **Containment hierarchy:** `session ⊃ turn ⊃ action ⊃ op`. A session contains one or more turns; a turn contains one or more actions; an action performs zero or more memory ops.
- **Two provenance questions are kept separate:** *who performed an operation* (the op's `actor`) is distinct from *where an item's content originated* (the item's `content_origin`). Conflating them is the mistake that produces false detection signals.

---

## 1. Foundational artefacts & structural hierarchy

**Native trace** — the `{ components, actions, actions_edge }` JSON that is the canonical observability artefact, extended by Persival with the memory vocabulary below. This is the scientific contribution and the source of truth.
- *Schema:* the whole extended document.
- *Not:* the laid-out render file. Geometry and pre-computed demo metrics do not belong here.

**Laid-out graph** — a pre-positioned ReactFlow file (`reactflow_graph_*.json`) with node positions and baked-in illustrative metrics, consumed directly by the frontend.
- *Schema:* out of scope — derived, illustrative, not canonical.
- *Not:* a source of truth. Its metric values are demo figures, not validated measurements.

**Session** — a bounded interaction context with its own working memory; persistent memory carries across sessions. The unit across which injection occurs (write in session *i*, trigger in session *j*).
- *Schema:* `session_id` on every action and human-input; a top-level `sessions[]` index (`session_id` → order, label, metadata).
- *Not:* a turn (a session contains one or more turns); not AgentSeer's existing outer-array grouping (that grouping is a *turn*). There is no session concept in the unextended trace.

**Turn** — one human input plus the ordered chain of agent actions it triggers. This is AgentSeer's existing outer-array grouping.
- *Schema:* the existing array-of-arrays structure of `actions`; each inner array is one turn and begins with a `human_input_*`.
- *Not:* a session (coarser) or a single action (finer).

**Action** — one LLM operation by an agent: response generation, a tool call, or an agent-to-agent handoff, as already recorded by AgentSeer.
- *Schema:* an `action_*` object inside a turn's inner array.
- *Not:* a memory operation. A memory op is a *consequence* of an action; an action performs zero or more ops and is never itself typed as read/write/etc.

**Op (memory operation)** — a single typed access an action makes to memory, drawn from the five abstract operations. The atomic unit of the memory layer.
- *Schema:* an entry in an action's `memory_ops[]`; rendered as a satellite op node hanging off its parent action.
- *Not:* a node in the action backbone, and never backend-specific — the concrete call name is an attribute (`native_call`), not the op's identity.

---

## 2. Memory stores and their characterising axes

**Memory store** — a container that holds memory items, fully characterised by four orthogonal axes (locus × substrate × persistence × scope). Generalises AgentSeer's `short_term_memory` / `long_term_memory`.
- *Schema:* an entry in `memory_stores[]` with `label`, `name`, `locus`, `substrate`, `persistence`, `scope`, `retrieval_method`; rendered as a component node.
- *Not:* a per-backend type. "Archival storage", "vector store", "MemCube" are *labels/values* on the axes, never distinct node types. Also not an opaque blob — it holds addressable items.

**Tier** — shorthand for a store's position in the (locus × substrate) space; a way to say "what kind of store" without naming a backend.
- *Schema:* not a standalone field — it *is* the store's `locus` and `substrate` values taken together.
- *Not:* a MemGPT-specific concept. MemGPT's four "tiers" are simply four stores at different loci; the term is not a fixed enum we hardcode.

**Locus** — where a store sits relative to the model's active context.
- *Values:* `in_context` (visible to the LLM now) · `out_of_context` (must be retrieved) · `intrinsic` (baked into weights).

**Substrate** — the representation of stored content.
- *Values:* `text` · `graph` (structured triples) · `activation` (KV-cache tensors) · `parametric` (weight deltas).
- *Not:* uniformly observable. `text`/`graph` support item-level granularity; `activation`/ `parametric` degrade to tier-level events with no item diff — an honest limitation, surfaced in the UI, not faked.

**Persistence** — how long items in a store survive.
- *Values:* `session` (cleared at session end) · `persistent` (survives across sessions) · `transient` (within a single inference only).

**Scope** — who may access a store.
- *Values:* `agent_scoped` (one agent) · `shared` (multiple agents).

---

## 3. Memory items

**Memory item** — a single addressable unit of stored content, with a stable identity and provenance. The finest addressable memory granularity.
- *Schema:* an entry in `memory_items[]` (`item_id`, `store_label`, `status`, `provenance`); referenced by an op's `item_ids[]`.
- *Not:* a store; not ephemeral (its `item_id` is stable and persists across sessions — this identity *is* the cross-session bridge); not always fully observable (see `substrate`).

**Item status** — the lifecycle state of an item.
- *Values:* `active` · `invalidated` (soft-deleted, retained for tracing) · `evicted` (moved out of a store) · `expired` (lapsed by policy).
- *Not:* deletion by removal — invalidated/evicted/expired items stay in the trace so injection can still be traced through them.

**Injected item** — an item whose content originates from adversarial `external_input` and is intended to steer later behaviour.
- *Schema:* an ordinary `memory_items[]` entry whose `provenance.content_origin` roots in `external_input`; "injected" is an analytic label, not a schema field.
- *Not:* structurally distinguishable from a benign externally-rooted item by provenance alone (see *detection-signal*).

---

## 4. Abstract operations

The five verbs are the schema. Each maps to backend-native calls via the `native_call` attribute; the abstract verb is what generalises across architectures.

**WRITE** — create a new memory item.
- *Native e.g.:* MemGPT `archival_storage.insert` / `working_context.append`; Mem0 `ADD`; MemOS install MemCube.

**READ** — bring an existing item into the active context (retrieval).
- *Native e.g.:* MemGPT `archival_storage.search`; Mem0 top-*k* retrieval; MemOS MemScheduler inject. Retrieval mechanics ride on `retrieval_method`, not a separate op.

**UPDATE** — modify an existing item's content (a semantic change to the same item).
- *Native e.g.:* MemGPT `working_context.replace`; Mem0 `UPDATE`; MemOS edit / merge.

**DELETE** — remove or invalidate an item.
- *Native e.g.:* Mem0 `DELETE` (Mem0g soft-invalidate); MemGPT overflow eviction; MemOS expire / evict. Sets `status`, does not erase the node.

**TRANSFORM** — migrate or derive an item across tier or representation while preserving its semantic content; many-to-one for summarisation/consolidation.
- *Native e.g.:* MemGPT evict-to-recall + recursive summary; MemOS `plaintext ⇒ activation ⇒ parametric`. Records `derived_from` parents.
- *Not:* a content-changing edit (that is UPDATE). TRANSFORM is content-preserving; modelling it as DELETE+WRITE is wrong because it would sever the lineage chain injection tracing needs.

**NOOP** — a recorded decision that no memory change was made.
- *Schema:* an op entry with `op: "noop"`; performs no mutation and creates no item.
- *Native e.g.:* Mem0 `NOOP`. Present for completeness; not one of the five mutating ops.

*Anti-overfit rule for this whole section:* never add a per-backend operation type. If a backend call does not fit one of the five verbs, revisit the mapping — do not add a sixth.

---

## 5. Actors

**actor** — the operator that *performed* a memory op.
- *Values / Schema:* `reasoning_agent` | `memory_controller`, on each `memory_ops[]` entry.

**content_origin** — the origin of an item's *content*.
- *Values / Schema:* `reasoning_agent` | `memory_controller` | `external_input`, on `memory_items[].provenance`.
- *Not:* interchangeable with `actor`. `external_input` can be a `content_origin` but never an op `actor` — external content is *persisted by* an agent or controller op whose result roots in `external_input`.

**reasoning_agent** — the task-performing LLM whose prompt is directly steerable; a memory op it initiates is under direct prompt influence.

**memory_controller** — a memory subsystem that operates memory on the agent's behalf or autonomously (MemGPT queue manager; Mem0 extraction/update LLM; MemOS MemScheduler / MemReader / MemLifecycle). Steerable only *indirectly*, through the input it consumes.

**external_input** — incoming user/environment content; the channel through which adversarial content enters. A provenance origin, not an operator.
- *Not:* an op initiator — it appears as `content_origin`, never as `actor`.

---

## 6. Provenance, lineage, and links

**Provenance** — the origin record of an item: which action and session created it, its content's source actor, and its derivation parents. Modelled on W3C PROV (entity / activity / agent / derivation).
- *Schema:* `memory_items[].provenance = { origin_action, origin_session, content_origin, derived_from[] }`.

**Lineage** (`derives_from`) — the item-to-item derivation chain: which prior item(s) an item was produced from, via UPDATE or TRANSFORM. The chain injection tracing walks across summaries and tier migrations.
- *Schema:* `provenance.derived_from[]`; surfaced as the derived `derives_from` edge (item → item).
- *Not:* `operates_on` (that is action ↔ store/item); lineage is item ↔ item.

**operates_on** — the referential link from an action (via one of its ops) to the store/item it touched. The bridge between the action graph and the component graph.
- *Schema:* a *derived* edge computed from `memory_ops` (`store_label`, `item_ids`); surfaced as cross-panel highlighting.
- *Not:* a drawn cross-canvas line, and not authored separately — it is projected from `memory_ops` ("declare once, derive").

**resides_in** — item → store containment: which store currently holds an item.
- *Schema:* an item's `store_label`; surfaced as a derived edge.

**Label** — the string identifier that serves as both a component's identity and its cross-reference key; all linking is by label (AgentSeer convention: `node.id === label`).
- *Not:* a numeric or UUID foreign key — those may exist (`span_id`, message ids) but are not the linking mechanism.

*Derived-edge principle:* `operates_on`, `derives_from`, and `resides_in` are edge-shaped *views* of facts already in `memory_ops` and `memory_items`. Fixtures author the ops and items; the edges are projected at render time. Never author both.

---

## 7. State capture

**Before/after diff** — the record of what a single op *changed*: the item(s) added, updated, or deleted, with their content — not a full copy of the store.
- *Schema:* `memory_ops[].before_after`.
- *Not:* a full snapshot. Storing full store state after every op does not scale.

**Snapshot** — a full capture of a store's item set, taken only at session boundaries.
- *Schema:* boundary-level (shape confirmed in the schema spec).
- *Not:* a per-op artefact.

**native_details** — the polymorphic, backend-specific payload attached to an op for the details panel: e.g. MemGPT summary text + evicted messages; Mem0 ADD/UPDATE/DELETE/NOOP decision + old vs new fact; MemOS MemCube metadata header.
- *Schema:* `memory_ops[].native_details`.
- *Not:* graph structure. This is the escape hatch that keeps the graph architecture-neutral: all backend richness lives here, never as a node or edge type.

---

## 8. Metrics

Metric *definitions* are fixed here so trace-level computation is unambiguous. Heavy or external computations (e.g. utility drop) are noted as such.

**ISR (Injection Success Rate)** — the rate at which an injection attempt successfully creates a *persistent* memory item that survives into a later session.
- *Trace-level:* WRITE ops producing items that persist across a session boundary.

**ASR (Attack Success Rate)** — the rate at which an injected item actually causes the target malicious behaviour in a later session.
- *Trace-level:* a path from an injected item, via a READ, into an action whose output matches the attack target.
- *Not:* the same as ISR — ISR measures persistence of the injection; ASR measures its effect.

**Persistence (rate / span)** — whether and how long an injected item survives across sessions and transformations.
- *Trace-level:* following `derives_from` + `resides_in` across session graphs and counting survival.

**Detection-signal** — a structural indicator, computable from the graph, that flags a likely injected item. It is the *combination* of signals — an `external_input` provenance root, plus cross-session influence that diverges from a session's own request, plus laundering (TRANSFORM-based) or flat co-retrieval — not any single field.
- *Trace-level:* graph motifs over provenance, `derives_from`, and cross-session READ influence.
- *Not:* a boolean read off one field. Provenance root alone false-positives on benign externally-rooted memory, so detection is measured against a benign baseline trace. This is the instrumentation contribution.

**Utility drop** — degradation in task performance under attack versus benign.
- *Trace-level:* computed *upstream/externally*; the trace only *localises* which action consumed the poisoned item.

---

## 9. Attack vocabulary

**MINJA** — the studied attack class: cross-session memory injection driven by indication prompts plus a progressive shortening strategy; the attacker touches only `external_input` and relies on a `memory_controller` to persist adversarial content.
- *Not:* direct memory tampering — the threat model assumes no direct write access to the store.

**Injection** — the act of causing adversarial content to become a persistent memory item.
- *Trace-level:* a WRITE (usually `memory_controller`-actored) producing an item whose `content_origin` roots in `external_input`.

**Laundering** — the obscuring of an injected item's adversarial origin, typically when a TRANSFORM (summarisation/consolidation) folds it into a `memory_controller`-authored item whose content no longer visibly ties to `external_input`.
- *Trace-level:* a `derives_from` chain whose surviving node is controller-authored but whose root is `external_input`.
- *Not:* invisible — the lineage chain preserves the root, which is exactly what makes laundering detectable rather than a dead end.

---

*Ratify these definitions and the schema spec is built directly on them. Changes to terminology start here, then propagate to the spec, validator, and code.*