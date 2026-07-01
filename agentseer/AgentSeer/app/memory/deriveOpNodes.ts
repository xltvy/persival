// Persival Phase 2 — derive memory-op satellite nodes for the action graph.
// Fork C: the native trace's action.memory_ops[] is authoritative for WHICH op
// nodes exist; there are NO baked positions for them (unlike Phase 1's store
// nodes, which borrowed geometry). So this is the first place Fork C COMPUTES
// geometry: each op node is placed as an outer-side fan offset from its parent
// action node's known position.
//
// Placement (see the ratified Phase 2 design):
//   • Side sign s per action: within its chain (a native actions inner array),
//     the two action-column x-values split left/right. Nodes in the RIGHT column
//     (larger x) fan RIGHT (s=+1, into the open gap toward the next chain);
//     LEFT column (smaller x) fans LEFT (s=-1, into open canvas). This keeps
//     satellites off the tight ~80px spine corridor and its dense edge bundle.
//   • Horizontal: s=+1 → ax + ACTION_W + GAP_X;  s=-1 → ax - GAP_X - SAT_W.
//   • Vertical fan for n ops: ay + FAN_Y0 + i*FAN_STEP.
//
// Collision note: comfortable for the demo (≤2 ops/action) and holds ~5 ops per
// action before approaching the next same-column node (400px down). >5 ops on a
// dense-chain action is a Phase-5 density concern, NOT handled here — this fan
// is not collision-proof for arbitrary op counts.
import type { MemoryOp, OpNodeData } from './types';

// Tunable geometry constants — sized to the real rendered nodes (action node
// min-width 220px; same-column vertical gap 400px).
const ACTION_W = 220; // action node footprint width
const GAP_X = 36; // clearance between action node edge and satellite
const FAN_STEP = 44; // vertical pitch between stacked ops
const FAN_Y0 = 8; // vertical offset of the first op from the action's top

// Op pills are fit-content (opNode.css) — the widest verb ("transform") is
// noticeably wider than a fixed box, so the fan offset must use each pill's
// ACTUAL width, not a constant, to keep the action-side gap uniform. Estimated
// from the pill's box model + per-character advance of the uppercase 0.72rem
// bold label; kept slightly generous so the gap never closes visually.
const PILL_HPAD = 16; // 8px left + 8px right padding
const PILL_BORDER = 3; // 1.5px each side
const PILL_GLYPH = 16; // glyph advance
const PILL_GAP = 6; // gap between glyph and label
const PILL_CHAR = 7.6; // per-uppercase-char advance at 0.72rem bold

/** Estimated rendered width of an op pill for the given verb label. */
function pillWidth(verb: string): number {
  return PILL_HPAD + PILL_BORDER + PILL_GLYPH + PILL_GAP + verb.length * PILL_CHAR;
}

// Minimal shape of a rendered ReactFlow action node we read here.
interface RawActionNode {
  id: string;
  type?: string;
  position?: { x: number; y: number };
  [k: string]: unknown;
}

// A native action/human_input object; only label + memory_ops matter here.
interface NativeActionObj {
  label?: string;
  memory_ops?: MemoryOp[];
  [k: string]: unknown;
}

export interface DerivedOpNode {
  id: string;
  type: 'memory_op_node';
  position: { x: number; y: number };
  data: OpNodeData;
}

export interface DerivedTether {
  id: string;
  source: string;
  target: string;
  type: 'straight';
  selectable: false;
  style: { stroke: string; strokeWidth: number };
}

export interface SplicedOps {
  nodes: DerivedOpNode[];
  edges: DerivedTether[];
}

const EMPTY: SplicedOps = { nodes: [], edges: [] };

/**
 * Emit op-node satellites + their tether edges for every action that carries a
 * non-empty memory_ops[]. Returns { nodes: [], edges: [] } when the native
 * actions are absent or carry no ops, so the action graph renders exactly as
 * before (back-compat: pre-extension traces are the degenerate case).
 *
 * The result is meant to be APPENDED to the existing action nodes/edges — it
 * never touches the backbone.
 */
export function spliceOpNodes(
  actionNodes: RawActionNode[],
  nativeActions: NativeActionObj[][] | undefined,
): SplicedOps {
  if (!nativeActions || nativeActions.length === 0) return EMPTY;

  // Rendered position per node id (the join is label === id; SCHEMA §4.5).
  const positionById = new Map<string, { x: number; y: number }>();
  for (const n of actionNodes) {
    if (n.position) positionById.set(n.id, n.position);
  }

  // Side sign per action label, computed per chain (native inner array).
  const sideByLabel = new Map<string, -1 | 1>();
  for (const chain of nativeActions) {
    const xs: number[] = [];
    for (const obj of chain) {
      const label = obj.label;
      if (!label || !label.startsWith('action_')) continue;
      const pos = positionById.get(label);
      if (pos) xs.push(pos.x);
    }
    if (xs.length === 0) continue;
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const threshold = (minX + maxX) / 2; // midpoint of the two columns
    for (const obj of chain) {
      const label = obj.label;
      if (!label || !label.startsWith('action_')) continue;
      const pos = positionById.get(label);
      if (!pos) continue;
      // Degenerate single-column chain (minX === maxX) → all default to +1.
      sideByLabel.set(label, pos.x >= threshold ? 1 : -1);
    }
  }

  const nodes: DerivedOpNode[] = [];
  const edges: DerivedTether[] = [];

  for (const chain of nativeActions) {
    for (const obj of chain) {
      const label = obj.label;
      if (!label || !label.startsWith('action_')) continue;
      const ops = obj.memory_ops;
      if (!ops || ops.length === 0) continue; // 0-op action contributes nothing
      const parentPos = positionById.get(label);
      if (!parentPos) continue; // no rendered parent → skip (nothing to hang off)
      const side = sideByLabel.get(label) ?? 1;

      ops.forEach((op, i) => {
        // Uniform action-side gap on both sides. Right pills anchor their LEFT
        // edge a fixed gap right of the action box (they extend rightward by
        // their own width). Left pills must anchor their RIGHT edge a fixed gap
        // left of the action box, so the top-left x subtracts the ACTUAL width.
        const w = pillWidth(op.op);
        const satX =
          side === 1
            ? parentPos.x + ACTION_W + GAP_X
            : parentPos.x - GAP_X - w;
        const satY = parentPos.y + FAN_Y0 + i * FAN_STEP;
        const opId = `${label}__op_${i}`;
        nodes.push({
          id: opId,
          type: 'memory_op_node',
          position: { x: satX, y: satY },
          data: { op, parentActionId: label, side, index: i },
        });
        edges.push({
          id: `e_${opId}`,
          source: label,
          target: opId,
          type: 'straight',
          selectable: false,
          style: { stroke: '#c8c8c8', strokeWidth: 1 },
        });
      });
    }
  }

  return { nodes, edges };
}
