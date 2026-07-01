// Persival Phase 1 — memory-layer types.
// Mirrors schema/SCHEMA.md §4.2 (components.memory_stores) and schema/GLOSSARY.md
// (memory store; locus / substrate / persistence / scope / retrieval_method).
// This is the data contract for the DATA-DRIVEN component-graph memory nodes.

/** Where a store sits relative to the model's active context (GLOSSARY §2). */
export type Locus = 'in_context' | 'out_of_context' | 'intrinsic';

/** The representation of stored content (GLOSSARY §2). */
export type Substrate = 'text' | 'graph' | 'activation' | 'parametric';

/** How long items in a store survive (GLOSSARY §2). */
export type Persistence = 'session' | 'persistent' | 'transient';

/** Who may access a store (GLOSSARY §2). */
export type Scope = 'agent_scoped' | 'shared';

/** Store-default retrieval mechanism (GLOSSARY §2 / SCHEMA §4.2). */
export type RetrievalMethod = 'vector' | 'graph' | 'exact' | 'none';

/**
 * A memory store as declared in the native trace's components.memory_stores[].
 * `agent` (owning agent NAME) is present iff scope === 'agent_scoped'.
 * These are SCHEMA ATTRIBUTES only — no position, no risk (see geometry overlay).
 */
export interface MemoryStore {
  label: string;
  name: string;
  locus: Locus;
  substrate: Substrate;
  persistence: Persistence;
  scope: Scope;
  retrieval_method: RetrievalMethod;
  agent?: string;
}

/**
 * Demo-only geometry borrowed from the pre-laid-out ReactFlow node via the
 * label === node.id join. NOT store attributes — kept structurally separate so
 * no one mistakes `risk` for a schema field. (Fork C: reuse existing geometry.)
 */
export interface GeometryOverlay {
  risk?: number;
}

/**
 * `data` payload of a derived `memory_store_node` in the component graph.
 * Store schema attributes and borrowed geometry are deliberately separated.
 */
export interface MemoryStoreNodeData extends Record<string, unknown> {
  store: MemoryStore;
  geometryOverlay: GeometryOverlay;
}

// ---------------------------------------------------------------------------
// Persival Phase 2 — memory-op satellite layer (action graph).
// Mirrors schema/SCHEMA.md §4.6 (MemoryOp) and §5 (operates_on derived view).
// Op nodes are derived from action.memory_ops and hang off their parent action.
// ---------------------------------------------------------------------------

/** The five abstract verbs plus noop (GLOSSARY §3; SCHEMA §4.6). */
export type OpVerb = 'write' | 'read' | 'update' | 'delete' | 'transform' | 'noop';

/** Who performed the op — never external_input (SCHEMA §4.6; GLOSSARY actor). */
export type Actor = 'reasoning_agent' | 'memory_controller';

/**
 * A single memory operation on an action, per SCHEMA §4.6. Only `op`,
 * `native_call`, `actor` and `store_label` are needed for the Phase 2 op-node
 * FACE; the remaining fields are carried through for later phases (the details
 * panel, Phase 4) and are optional here because the demo trace omits them.
 * `store_label` is the operates_on target (§5) — carried on the node for the
 * Phase 3 cross-panel highlight; Phase 2 does NOT wire the interaction.
 */
export interface MemoryOp {
  op: OpVerb;
  native_call: string;
  actor: Actor;
  store_label: string;
  item_ids?: string[];
  retrieval_method?: RetrievalMethod;
  before_after?: Record<string, unknown>;
  native_details?: Record<string, unknown>;
}

/**
 * `data` payload of a derived `memory_op_node` in the action graph. Carries the
 * op itself, the parent action's id (the tether target), and the computed
 * satellite placement (side sign + index within the parent's fan) so geometry
 * stays inspectable and the node face can stay purely presentational.
 */
export interface OpNodeData extends Record<string, unknown> {
  op: MemoryOp;
  parentActionId: string;
  side: -1 | 1;
  index: number;
}
