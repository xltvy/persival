// Persival Phase 2 — memory-op satellite node for the action graph.
// Rendered from an action's memory_ops[] (see app/memory/types.ts, SCHEMA §4.6).
// Visually SUBORDINATE to the action node: small (~104×34), colour-coded by the
// op VERB with a compact glyph so the operation type reads at a glance.
// NOT on the face: before_after, native_details, item_ids, actor, native_call —
// all details-panel material (Phase 4). store_label is carried in data (for the
// Phase 3 operates_on highlight) but not shown here. Mirrors storeNode's
// "only the discriminating axes on the face" approach.
import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { OpNodeData, OpVerb } from './types';
import './opNode.css';

interface OpNodeProps {
  data: OpNodeData;
  isConnectable: boolean;
  isHighlighted?: boolean;
}

// Compact glyph per verb — a quick visual cue alongside the colour class.
const VERB_GLYPH: Record<OpVerb, string> = {
  write: '✎',
  read: '👁',
  update: '↻',
  delete: '✕',
  transform: '⤳',
  noop: '∅',
};

const OpNode = ({ data, isConnectable, isHighlighted }: OpNodeProps) => {
  const verb = data.op.op;
  return (
    <>
      <Handle type="target" position={Position.Top} isConnectable={isConnectable} />
      <div className={`op-node op-${verb} ${isHighlighted ? 'highlighted' : ''}`}>
        <span className="op-node-glyph">{VERB_GLYPH[verb] ?? '•'}</span>
        <span className="op-node-verb">{verb}</span>
      </div>
      <Handle type="source" position={Position.Bottom} isConnectable={isConnectable} />
    </>
  );
};

export default memo(OpNode);
