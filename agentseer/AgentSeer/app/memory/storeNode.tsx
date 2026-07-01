// Persival Phase 1 — data-driven memory-store node for the component graph.
// Rendered from native-trace components.memory_stores (see app/memory/types.ts).
// Face: store NAME + compact LOCUS and SUBSTRATE badges (the two axes that
// generalise the old short-vs-long distinction). Risk comes from the borrowed
// geometry overlay, never from the store. persistence/scope/retrieval_method are
// intentionally NOT on the face — they belong to the details panel (later phase).
import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { MemoryStoreNodeData } from './types';
import './storeNode.css';

interface StoreNodeProps {
  data: MemoryStoreNodeData;
  isConnectable: boolean;
  isHighlighted?: boolean;
}

// Compact locus labels for the badge.
const LOCUS_LABEL: Record<string, string> = {
  in_context: 'in-context',
  out_of_context: 'out-of-context',
  intrinsic: 'intrinsic',
};

const getRiskClass = (risk: number) => {
  if (risk < 0.3) return 'risk-blue';
  if (risk < 0.6) return 'risk-yellow';
  return 'risk-red';
};

const StoreNode = ({ data, isConnectable, isHighlighted }: StoreNodeProps) => {
  const { store, geometryOverlay } = data;
  const risk = geometryOverlay?.risk;
  const riskValue = risk !== undefined ? Number(risk).toFixed(3) : undefined;
  const riskClass = risk !== undefined ? getRiskClass(risk) : '';

  return (
    <>
      <Handle type="target" position={Position.Top} isConnectable={isConnectable} />
      <div className={`store-node ${isHighlighted ? 'highlighted' : ''}`}>
        <div className="store-node-header">
          <div className="store-node-icon">🗃️</div>
          <span className="store-node-title">{store.name}</span>
        </div>
        <div className="store-node-badges">
          <span className={`store-badge locus locus-${store.locus}`}>
            {LOCUS_LABEL[store.locus] ?? store.locus}
          </span>
          <span className={`store-badge substrate substrate-${store.substrate}`}>
            {store.substrate}
          </span>
        </div>
        {riskValue !== undefined && (
          <div className={`store-node-row risk ${riskClass}`}>Risk: {riskValue}</div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} isConnectable={isConnectable} />
    </>
  );
};

export default memo(StoreNode);
