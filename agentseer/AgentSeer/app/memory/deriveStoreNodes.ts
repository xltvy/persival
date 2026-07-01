// Persival Phase 1 — derive-and-replace the component-graph memory subset.
// Fork C: memory_stores (native trace) is authoritative for WHICH memory nodes
// exist; geometry (position) and demo risk are borrowed from the pre-laid-out
// ReactFlow node joined by id === store.label.
import type { MemoryStore, MemoryStoreNodeData } from './types';

// Minimal shapes we read off the raw ReactFlow component nodes.
interface RawNode {
  id: string;
  type?: string;
  position?: { x: number; y: number };
  data?: Record<string, unknown>;
  [k: string]: unknown;
}

/** A derived component-graph node for one memory store. */
export interface DerivedStoreNode {
  id: string;
  type: 'memory_store_node';
  position: { x: number; y: number };
  data: MemoryStoreNodeData;
}

/**
 * Replace the baked `memory_node` entries with store nodes derived from
 * memory_stores. Non-memory component nodes are returned untouched. Derived
 * nodes keep id === store.label === old node id, so the existing agent→memory
 * edges and highlighting still resolve.
 *
 * If `memoryStores` is empty/undefined, the baked memory nodes are returned
 * unchanged (back-compat: short/long-term memory is the degenerate case).
 */
export function spliceMemoryStoreNodes(
  componentNodes: RawNode[],
  memoryStores: MemoryStore[] | undefined,
): Array<RawNode | DerivedStoreNode> {
  if (!memoryStores || memoryStores.length === 0) {
    return componentNodes; // fallback: keep baked memory_node nodes
  }

  const nonMemory = componentNodes.filter((n) => n.type !== 'memory_node');
  const geometryById = new Map(componentNodes.map((n) => [n.id, n]));

  const derived: DerivedStoreNode[] = memoryStores.map((store) => {
    const geometry = geometryById.get(store.label);
    const position = geometry?.position ?? { x: 0, y: 0 };
    const risk = geometry?.data?.risk as number | undefined;
    return {
      id: store.label,
      type: 'memory_store_node',
      position,
      data: {
        store: {
          label: store.label,
          name: store.name,
          locus: store.locus,
          substrate: store.substrate,
          persistence: store.persistence,
          scope: store.scope,
          retrieval_method: store.retrieval_method,
          ...(store.agent !== undefined ? { agent: store.agent } : {}),
        },
        geometryOverlay: { risk },
      },
    };
  });

  return [...nonMemory, ...derived];
}
