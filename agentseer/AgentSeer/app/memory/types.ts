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
