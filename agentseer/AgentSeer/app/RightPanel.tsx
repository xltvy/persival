import React, { useRef, useEffect, useState, useCallback } from 'react';
import './RightPanel.css';
// Reuse the Phase-2 op-pill styling (verb glyph + colour) for the panel header badge.
import './memory/opNode.css';

interface RightPanelProps {
  selectedNode: any;
  width: number;
  setWidth: (w: number) => void;
}

interface ToolCall {
  name?: string;
  args?: Record<string, any>;
  function?: {
    name: string;
    arguments: Record<string, any>;
  };
}

interface Message {
  content: string;
  type: string;
  name?: string;
  tool_calls?: ToolCall[];
  additional_kwargs?: {
    tool_calls?: ToolCall[];
  };
}

interface ActionInfo {
  id: string;
  input: Message[];
  output: {
    generations: Array<Array<{
      message: {
        content: string;
        additional_kwargs: {
          tool_calls?: any[];
        };
      };
    }>>;
  };
  agent_id: string;
  agent_name: string;
  model: string;
  input_components: string[];
  output_components: string[];
  average_jailbreak_ASR: number;
  blast_radius: number;
  weighted_blast_radius: number;
  systemic_risk: number;
  weighted_systemic_risk: number;
}

interface AgentInfo {
  name: string;
  system_prompt: string;
  model: string;
  id: string;
  risk: number;
}

// Phase 4 — a memory OP selected in the action graph. The op-node face carries only
// op/native_call/actor/store_label; before_after + native_details are re-read from the
// native trace (SCHEMA §4.6/§4.7/§4.9). store_name is store_label resolved to the name.
interface MemoryOpInfo {
  op: string;
  actor: string;
  native_call: string;
  store_label: string;
  store_name: string;
  retrieval_method?: string;
  item_ids?: string[];
  before_after?: {
    added?: Array<{ item_id: string; content: string }>;
    updated?: Array<{ item_id: string; before: string; after: string }>;
    deleted?: Array<{ item_id: string; content: string; new_status: string }>;
  };
  native_details?: Record<string, unknown>;
}

// Phase 4 — a memory STORE selected in the component graph. All attributes are already
// on node.data.store (the axes Phase 1 keeps OFF the node face); no trace fetch needed.
interface MemoryStoreInfo {
  name: string;
  locus: string;
  substrate: string;
  persistence: string;
  scope: string;
  retrieval_method: string;
  agent?: string;
  risk?: number;
}

interface ToolInfo {
  tool_name: string;
  description: string;
  id: string;
  risk: number;
}

interface ActionAttackData {
  action_label: string;
  action_risk: number;
  asr: number;
  attack_count: number;
  successful_attacks: Array<{
    id: string;
    objective: string;
    category: string;
    prompt: string;
    response_preview: string;
    rating: number;
  }>;
}

const MIN_WIDTH = 20; // Percentage
const MAX_WIDTH = 40; // Percentage

// Phase-2 verb glyphs, reused on the op-panel header badge (mirrors opNode.tsx).
const VERB_GLYPH: Record<string, string> = {
  write: '✎', read: '👁', update: '↻', delete: '✕', transform: '⤳', noop: '∅',
};

// native_details label map — COSMETIC ONLY. It prettifies the DISPLAYED label for a
// handful of common keys across backends (MemGPT / Mem0 / MemOS-ish). It is NOT a
// whitelist: an unmapped key still renders (its raw key + value) via `prettyKey`'s
// fallback. There is deliberately NO per-backend branching anywhere — backend identity
// lives in the data (native_call + native_details contents), never in this control flow.
const NATIVE_DETAIL_LABELS: Record<string, string> = {
  summary: 'Summary',
  evicted_message_ids: 'Evicted messages',
  decision: 'Decision',
  old_fact: 'Old fact',
  new_fact: 'New fact',
  // MemOS MemCube-ish keys — still just cosmetic labels.
  mem_cube_id: 'MemCube ID',
  priority: 'Priority',
  ttl: 'TTL',
  access_count: 'Access count',
};

// Cosmetic label lookup; unmapped keys fall back to the RAW key so nothing is dropped.
const prettyKey = (k: string): string => NATIVE_DETAIL_LABELS[k] ?? k;

// The before/after box header adapts to the op: mutating ops show a diff, read shows
// what was retrieved, noop shows the (no-)result.
const beforeAfterHeader = (op: string): string =>
  op === 'read' ? 'Retrieved Items' : op === 'noop' ? 'Result' : 'Before / After';

// Helper function to get risk class based on value
const getRiskClass = (risk: number): string => {
  if (risk > 0.5) return 'high-risk';
  if (risk > 0.3) return 'medium-risk';
  return 'low-risk';
};

// Tooltip component with explanation
const Tooltip: React.FC<{ text: string; children: React.ReactNode }> = ({ text, children }) => (
  <div className="rp-tooltip-container">
    {children}
    <span className="rp-tooltip-icon">?</span>
    <span className="rp-tooltip-text">{text}</span>
  </div>
);

// Progress bar component for risk metrics
const RiskProgressBar: React.FC<{
  label: string;
  value: number;
  tooltip: string;
  isPercentage?: boolean;
  maxValue?: number;
}> = ({ label, value, tooltip, isPercentage = true, maxValue = 1 }) => {
  const percentage = isPercentage ? value * 100 : (value / maxValue) * 100;
  const displayValue = isPercentage ? `${Math.round(percentage)}%` : value.toFixed(1);
  const riskClass = percentage > 70 ? 'high-risk' : percentage > 30 ? 'medium-risk' : 'low-risk';

  return (
    <div className="rp-metric-with-progress">
      <div className="rp-metric-header">
        <Tooltip text={tooltip}>
          <span className="rp-metric-title">{label}</span>
        </Tooltip>
      </div>
      <div className="rp-progress-container">
        <div className="rp-progress-bar-bg">
          <div
            className={`rp-progress-bar-fill ${riskClass}`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
        <div className="rp-progress-value">
          <span className={`rp-progress-percent ${riskClass}`}>{displayValue}</span>
        </div>
      </div>
    </div>
  );
};

// Risk Summary Card component
const RiskSummaryCard: React.FC<{
  asr: number;
  blastRadius: number;
  systemicRisk: number;
}> = ({ asr, blastRadius, systemicRisk }) => {
  const overallRisk = (asr * 0.4 + systemicRisk * 0.6);
  const riskLevel = overallRisk > 0.6 ? 'high' : overallRisk > 0.3 ? 'medium' : 'low';
  const riskLevelText = riskLevel === 'high' ? 'High Risk' : riskLevel === 'medium' ? 'Medium Risk' : 'Low Risk';
  const riskIcon = riskLevel === 'high' ? '!' : riskLevel === 'medium' ? '!' : '';

  return (
    <div className="rp-summary-card">
      <div className="rp-summary-header">
        <span className="rp-summary-icon">{riskIcon}</span>
        <span className="rp-summary-title">Overall Risk Assessment</span>
        <span className={`rp-summary-level ${riskLevel}`}>{riskLevelText}</span>
      </div>
      <div className="rp-summary-stats">
        <div className="rp-summary-stat">
          <span className="rp-summary-stat-label">Attack Success Rate:</span>
          <span className="rp-summary-stat-value">{Math.round(asr * 100)}%</span>
        </div>
        <div className="rp-summary-stat">
          <span className="rp-summary-stat-label">Affected Components:</span>
          <span className="rp-summary-stat-value">{Math.round(blastRadius)}</span>
        </div>
      </div>
    </div>
  );
};

const RightPanel: React.FC<RightPanelProps> = ({ selectedNode, width, setWidth }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [actionInfo, setActionInfo] = useState<ActionInfo | null>(null);
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [memoryOpInfo, setMemoryOpInfo] = useState<MemoryOpInfo | null>(null);
  const [memoryStoreInfo, setMemoryStoreInfo] = useState<MemoryStoreInfo | null>(null);
  const [toolInfo, setToolInfo] = useState<ToolInfo | null>(null);
  const [actionAttackData, setActionAttackData] = useState<ActionAttackData | null>(null);
  const [showJailbreakExamples, setShowJailbreakExamples] = useState(false);
  const [expandedAttack, setExpandedAttack] = useState<string | null>(null);
  const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null);
  const [expandedResponse, setExpandedResponse] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [componentMap, setComponentMap] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(false);

  // Helper function to safely render content that might be an object
  const renderContent = (content: any): React.ReactNode => {
    if (typeof content === 'string') {
      return content;
    }
    if (content && typeof content === 'object') {
      // If it's an object, render it as formatted JSON in a pre tag
      return <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(content, null, 2)}</pre>;
    }
    return String(content || '');
  };
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadInfo = async () => {
      setError(null);
      setIsLoading(true);
      
      if (selectedNode?.type === 'llm_call_node') {
        try {
          // Get graph structure from reactflow_graph_with_multi_trace.json
          const graphResponse = await fetch('/reactflow_graph_with_multi_trace.json');
          const graphData = await graphResponse.json();

          // Load per-action attack data
          try {
            const actionAttackResponse = await fetch('/attack_data_for_demo.json');
            const actionAttackList = await actionAttackResponse.json();
            // Find attack data for the current action based on node label
            const actionLabel = selectedNode?.data?.label;
            if (actionLabel) {
              const matchingAttack = actionAttackList.find((a: ActionAttackData) => a.action_label === actionLabel);
              setActionAttackData(matchingAttack || null);
            }
          } catch (e) {
            console.warn('Failed to load action attack data:', e);
            setActionAttackData(null);
          }

          // Build component map from graph data (including risk values)
          const newComponentMap: Record<string, any> = {};
          try {
            if (graphData?.component?.nodes) {
              graphData.component.nodes.forEach((node: any) => {
                if (!node || !node.type || !node.data) return;

                if (node.type === 'agent_node' && node.data.agent_name) {
                  newComponentMap[node.id] = {
                    type: 'agent',
                    name: node.data.agent_name,
                    risk: node.data.risk || 0
                  };
                } else if (node.type === 'memory_node' && node.data.memory_content) {
                  newComponentMap[node.id] = {
                    type: 'memory',
                    name: node.data.memory_content.substring(0, 30) + (node.data.memory_content.length > 30 ? '...' : ''),
                    risk: node.data.risk || 0
                  };
                } else if (node.type === 'tool_node' && node.data.tool_name) {
                  newComponentMap[node.id] = {
                    type: 'tool',
                    name: node.data.tool_name,
                    risk: node.data.risk || 0
                  };
                }
              });
            }
          } catch (error) {
            console.warn('Error building component map:', error);
          }
          setComponentMap(newComponentMap);

          // Get action details from detailed_graph_langgraph_multi_trace.json
          const detailsResponse = await fetch('/detailed_graph_langgraph_multi_trace.json');
          const detailsData = await detailsResponse.json();
          
          try {
            // Find the action in the graph data for basic info
            const graphAction = graphData?.action?.nodes?.find((a: any) => a?.id === selectedNode?.id);
            
            if (graphAction?.data) {
              // Find detailed action data
              const detailedAction = detailsData?.actions?.flat()?.find((a: any) => a?.label === graphAction.data.label);
              
              setActionInfo({
                id: graphAction.id,
                input: detailedAction?.input || [],
                output: detailedAction?.output || { generations: [] },
                agent_id: graphAction.data.agent_id,
                agent_name: graphAction.data.agent_name,
                model: graphAction.data.model || 'Unknown Model',
                input_components: graphAction.data.input_components || [],
                output_components: graphAction.data.output_components || [],
                average_jailbreak_ASR: graphAction.data.average_jailbreak_ASR || 0,
                blast_radius: graphAction.data.blast_radius || 0,
                weighted_blast_radius: graphAction.data.weighted_blast_radius || 0,
                systemic_risk: graphAction.data.systemic_risk || 0,
                weighted_systemic_risk: graphAction.data.weighted_systemic_risk || 0
              });
            }
          } catch (error) {
            console.warn('Error processing action data:', error);
          }
          
          setAgentInfo(null);
          setMemoryOpInfo(null);
          setMemoryStoreInfo(null);
          setToolInfo(null);
        } catch (error) {
          console.error('Failed to load action info:', error);
          setActionInfo(null);
          setError('Failed to load action information. Please try again.');
        }
      } else if (selectedNode?.type === 'agent_node') {
        try {
          const response = await fetch('/detailed_graph_langgraph_multi_trace.json');
          const data = await response.json();
          
          const agent = data?.components?.agents?.find((a: any) => a?.label === selectedNode?.id);
          if (agent) {
            setAgentInfo({
              id: agent.label,
              name: agent.name,
              system_prompt: agent.system_prompt,
              model: selectedNode?.data?.model || 'Unknown Model',
              risk: selectedNode?.data?.risk || 0
            });
          }
          setActionInfo(null);
          setMemoryOpInfo(null);
          setMemoryStoreInfo(null);
          setToolInfo(null);
        } catch (error) {
          console.error('Failed to load agent info:', error);
          setAgentInfo(null);
          setError('Failed to load agent information. Please try again.');
        }
      } else if (selectedNode?.type === 'memory_op_node') {
        // Phase 4: the op-node face carries only op/native_call/actor/store_label, so
        // RE-READ the full op (before_after + native_details + item_ids) from the native
        // trace. Locate it by parentActionId + op index — the op-node id is
        // `${actionLabel}__op_${index}`, and OpNodeData carries both (Phase 2), so this
        // is an exact lookup, not a guess.
        try {
          const response = await fetch('/detailed_graph_langgraph_multi_trace.json');
          const data = await response.json();
          const faceOp = selectedNode?.data?.op || {};
          const parentActionId = selectedNode?.data?.parentActionId;
          const opIndex = selectedNode?.data?.index ?? 0;
          const action = data?.actions?.flat()?.find((a: any) => a?.label === parentActionId);
          const traceOp = action?.memory_ops?.[opIndex] ?? faceOp;
          const store = data?.components?.memory_stores?.find(
            (s: any) => s?.label === traceOp.store_label,
          );
          setMemoryOpInfo({
            op: traceOp.op,
            actor: traceOp.actor,
            native_call: traceOp.native_call,
            store_label: traceOp.store_label,
            store_name: store?.name ?? traceOp.store_label, // resolve to name; fall back to label
            retrieval_method: traceOp.retrieval_method,
            item_ids: traceOp.item_ids,
            before_after: traceOp.before_after,
            native_details: traceOp.native_details,
          });
          setActionInfo(null);
          setAgentInfo(null);
          setToolInfo(null);
          setMemoryStoreInfo(null);
        } catch (error) {
          console.error('Failed to load memory op info:', error);
          setMemoryOpInfo(null);
          setError('Failed to load memory operation information. Please try again.');
        }
      } else if (selectedNode?.type === 'memory_store_node') {
        // Phase 4: light store panel — every attribute is already on node.data.store
        // (the axes Phase 1 keeps off the node face), so no trace fetch is needed.
        const store = selectedNode?.data?.store;
        if (store) {
          setMemoryStoreInfo({
            name: store.name,
            locus: store.locus,
            substrate: store.substrate,
            persistence: store.persistence,
            scope: store.scope,
            retrieval_method: store.retrieval_method,
            agent: store.agent,
            risk: selectedNode?.data?.geometryOverlay?.risk,
          });
        } else {
          setMemoryStoreInfo(null);
        }
        setActionInfo(null);
        setAgentInfo(null);
        setToolInfo(null);
        setMemoryOpInfo(null);
      } else if (selectedNode?.type === 'tool_node') {
        try {
          const response = await fetch('/detailed_graph_langgraph_multi_trace.json');
          const data = await response.json();
          // First try to find the tool in the agent's tools
          let tool = null;
          for (const agent of data?.components?.agents || []) {
            tool = agent.tools?.find((t: any) => t?.tool_name === selectedNode?.id);
            if (tool) break;
          }
          if (tool) {
            setToolInfo({
              id: tool.tool_name,
              tool_name: tool.tool_name,
              description: tool.tool_description,
              risk: tool.risk || 0
            });
          }
          setActionInfo(null);
          setAgentInfo(null);
          setMemoryOpInfo(null);
          setMemoryStoreInfo(null);
        } catch (error) {
          console.error('Failed to load tool info:', error);
          setToolInfo(null);
          setError('Failed to load tool information. Please try again.');
        }
      } else {
        setActionInfo(null);
        setAgentInfo(null);
        setMemoryOpInfo(null);
        setMemoryStoreInfo(null);
        setToolInfo(null);
      }
      
      setIsLoading(false);
    };

    loadInfo();
  }, [selectedNode]);

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setIsDragging(true);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging) {
      const newWidth = ((window.innerWidth - e.clientX) / window.innerWidth) * 100;
      setWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth)));
    }
  }, [isDragging, setWidth]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const formatJsonString = (jsonString: string) => {
    try {
      const parsed = JSON.parse(jsonString);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return jsonString;
    }
  };

  // Header title for the label-less memory node types (op/store carry no data.label).
  const getHeaderTitle = (): string => {
    if (!selectedNode) return '';
    if (selectedNode.type === 'memory_op_node') {
      const verb = String(selectedNode.data?.op?.op ?? 'op').toUpperCase();
      const storeName = memoryOpInfo?.store_name ?? selectedNode.data?.op?.store_label ?? '';
      return `${verb} · ${storeName}`;
    }
    if (selectedNode.type === 'memory_store_node') {
      return selectedNode.data?.store?.name ?? 'Memory Store';
    }
    return selectedNode.data?.label ?? '';
  };

  // Before/After diff (SCHEMA §4.7). Renders only the arrays present; degrades with NO
  // empty box for read (retrieved items) and noop (decision / no change).
  const renderBeforeAfter = (info: MemoryOpInfo): React.ReactNode => {
    const ba = info.before_after;
    const hasDiff = ba && (ba.added?.length || ba.updated?.length || ba.deleted?.length);
    if (!hasDiff) {
      if (info.op === 'read') {
        const ids = info.item_ids ?? [];
        const method = info.retrieval_method ? ` via ${info.retrieval_method}` : '';
        return (
          <div className="rp-content-body">
            <div className="rp-value">Retrieved {ids.length} item(s){method}</div>
            {ids.map((id) => (
              <div key={id} className="rp-diff-item read">
                <span className="rp-diff-id">{id}</span>
              </div>
            ))}
          </div>
        );
      }
      // noop (or any op that legitimately carries no before_after)
      const decision = info.native_details?.decision as string | undefined;
      return (
        <div className="rp-content-body">
          <div className="rp-value">{decision ? `Decision: ${decision}` : 'No memory change.'}</div>
        </div>
      );
    }
    return (
      <div className="rp-content-body">
        {ba!.added?.map((a) => (
          <div key={a.item_id} className="rp-diff-item added">
            <div className="rp-diff-tag added">＋ added</div>
            <div className="rp-diff-id">{a.item_id}</div>
            <div className="rp-diff-content">{renderContent(a.content)}</div>
          </div>
        ))}
        {ba!.updated?.map((u) => (
          <div key={u.item_id} className="rp-diff-item updated">
            <div className="rp-diff-tag updated">✎ updated</div>
            <div className="rp-diff-id">{u.item_id}</div>
            <div className="rp-diff-content before">{renderContent(u.before)}</div>
            <div className="rp-diff-arrow">→</div>
            <div className="rp-diff-content after">{renderContent(u.after)}</div>
          </div>
        ))}
        {ba!.deleted?.map((d) => (
          <div key={d.item_id} className="rp-diff-item deleted">
            <div className="rp-diff-tag deleted">－ removed ({d.new_status})</div>
            <div className="rp-diff-id">{d.item_id}</div>
            <div className="rp-diff-content">{renderContent(d.content)}</div>
          </div>
        ))}
      </div>
    );
  };

  // GENERIC native_details renderer (SCHEMA §4.9). Iterates whatever keys the object
  // carries; the label map (prettyKey) is cosmetic only — an unmapped key still renders
  // with its raw key. NO per-backend branching: this same code renders MemGPT, Mem0 and
  // MemOS payloads identically. (Architecture-neutrality, now applied to the panel.)
  const renderNativeDetails = (nd: Record<string, unknown>): React.ReactNode => (
    <div className="rp-content-body">
      {Object.entries(nd).map(([k, v]) => (
        <div key={k} className="rp-nd-row">
          <div className="rp-label">{prettyKey(k)}</div>
          <div className="rp-nd-value">{renderContent(v)}</div>
        </div>
      ))}
    </div>
  );

  return (
    <div
      className="right-panel"
      ref={panelRef}
      style={{ width: `${width}%` }}
    >
      <div className="right-panel-drag-handle" onMouseDown={onMouseDown} role="presentation" />
      <div className="rp-header">{getHeaderTitle()}</div>
      
      {isLoading ? (
        <div className="rp-loading">
          <div className="rp-loading-spinner"></div>
          Loading component information...
        </div>
      ) : error ? (
        <div className="rp-error">
          <div className="rp-error-icon">!</div>
          {error}
        </div>
      ) : actionInfo && (
        <>
          <div className="rp-section">
            {/* Risk Summary Card */}
            <RiskSummaryCard
              asr={actionInfo.average_jailbreak_ASR}
              blastRadius={actionInfo.blast_radius}
              systemicRisk={actionInfo.systemic_risk}
            />

            <div className="rp-header-info">
              <div className="rp-header-main">
                <div className="rp-label">Agent Name:</div>
                <div className="rp-value">{actionInfo.agent_name}</div>
                <div className="rp-label">Agent ID:</div>
                <div className="rp-value">{actionInfo.agent_id}</div>
                <div className="rp-label">Model:</div>
                <div className="rp-value">{actionInfo.model || 'Unknown Model'}</div>
              </div>
            </div>

            <div className="rp-content-box">
              <div className="rp-content-header">Safety Metrics</div>
              <div className="rp-content-body">
                <RiskProgressBar
                  label="Jailbreak ASR"
                  value={actionInfo.average_jailbreak_ASR}
                  tooltip="Attack Success Rate: The proportion of attempts that successfully jailbreak the model. Higher values indicate greater vulnerability."
                />
                <RiskProgressBar
                  label="Blast Radius"
                  value={actionInfo.blast_radius}
                  tooltip="Impact Scope: The number of downstream components that could be affected if this node is compromised."
                  isPercentage={false}
                  maxValue={10}
                />
                <RiskProgressBar
                  label="Weighted Blast Radius"
                  value={actionInfo.weighted_blast_radius}
                  tooltip="Weighted version considers the importance and criticality of downstream components."
                  isPercentage={false}
                  maxValue={10}
                />
                <RiskProgressBar
                  label="Systemic Risk"
                  value={actionInfo.systemic_risk}
                  tooltip="System Risk: A comprehensive risk score combining attack success rate and impact scope."
                />
                <RiskProgressBar
                  label="Weighted Systemic Risk"
                  value={actionInfo.weighted_systemic_risk}
                  tooltip="Weighted version factors in the importance of affected downstream components."
                />
              </div>
            </div>

            {/* Per-Action Jailbreak Examples */}
            {actionAttackData && actionAttackData.successful_attacks.length > 0 && (
              <div className="rp-content-box" style={{ marginTop: '15px' }}>
                <div
                  className="rp-content-header"
                  style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  onClick={() => setShowJailbreakExamples(!showJailbreakExamples)}
                >
                  <span>Jailbreak Examples for This Action</span>
                  <span style={{ fontSize: '12px' }}>{showJailbreakExamples ? '▼' : '▶'}</span>
                </div>
                {showJailbreakExamples && (
                  <div className="rp-content-body">
                    {/* Action-specific ASR */}
                    <div style={{ marginBottom: '15px', padding: '12px', backgroundColor: '#f8d7da', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 'bold', color: '#721c24' }}>Action ASR (Attack Success Rate)</span>
                        <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#dc3545' }}>
                          {(actionAttackData.asr * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#856404', marginTop: '6px' }}>
                        {actionAttackData.attack_count} attack(s) tested against this action
                      </div>
                    </div>

                    {/* Attack Examples */}
                    <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#dc3545', fontSize: '0.95rem' }}>
                      Successful Jailbreak Examples ({actionAttackData.successful_attacks.length})
                    </div>
                    {actionAttackData.successful_attacks.map((attack) => (
                      <div
                        key={attack.id}
                        style={{
                          marginBottom: '12px',
                          padding: '14px',
                          backgroundColor: '#f8f9fa',
                          borderRadius: '8px',
                          border: '1px solid #dee2e6',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                        onClick={() => setExpandedAttack(expandedAttack === attack.id ? null : attack.id)}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: '#333', marginBottom: '6px', lineHeight: '1.4' }}>
                              {attack.objective}
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                              <span style={{
                                fontSize: '0.8rem',
                                padding: '4px 10px',
                                backgroundColor: attack.category === 'Authority' ? '#0d47a1' : attack.category === 'Roleplay' ? '#6f42c1' : '#28a745',
                                color: 'white',
                                borderRadius: '12px',
                                fontWeight: '500'
                              }}>
                                {attack.category}
                              </span>
                              <span style={{ fontSize: '0.8rem', padding: '4px 10px', backgroundColor: '#dc3545', color: 'white', borderRadius: '12px', fontWeight: '500' }}>
                                Rating: {attack.rating}/10
                              </span>
                            </div>
                          </div>
                          <span style={{ fontSize: '14px', color: '#666', marginLeft: '10px' }}>{expandedAttack === attack.id ? '▼' : '▶'}</span>
                        </div>

                        {expandedAttack === attack.id && (
                          <div style={{ marginTop: '10px', borderTop: '1px solid #dee2e6', paddingTop: '10px' }}>
                            <div style={{ marginBottom: '12px' }}>
                              <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#dc3545', marginBottom: '6px' }}>ATTACK PROMPT:</div>
                              <div style={{
                                fontSize: '0.85rem',
                                color: '#333',
                                backgroundColor: '#fff3cd',
                                padding: '12px',
                                borderRadius: '6px',
                                maxHeight: expandedPrompt === attack.id ? 'none' : '200px',
                                overflow: expandedPrompt === attack.id ? 'visible' : 'auto',
                                fontFamily: 'monospace',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                lineHeight: '1.5'
                              }}>
                                {attack.prompt}
                              </div>
                              {attack.prompt.length > 300 && (
                                <button
                                  className="rp-expand-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedPrompt(expandedPrompt === attack.id ? null : attack.id);
                                  }}
                                >
                                  {expandedPrompt === attack.id ? 'Collapse' : 'View Full Content'}
                                </button>
                              )}
                            </div>
                            <div>
                              <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#dc3545', marginBottom: '6px' }}>MODEL RESPONSE:</div>
                              <div style={{
                                fontSize: '0.85rem',
                                color: '#333',
                                backgroundColor: '#f8d7da',
                                padding: '12px',
                                borderRadius: '6px',
                                maxHeight: expandedResponse === attack.id ? 'none' : '150px',
                                overflow: expandedResponse === attack.id ? 'visible' : 'auto',
                                fontFamily: 'monospace',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                lineHeight: '1.5'
                              }}>
                                {attack.response_preview}
                              </div>
                              {attack.response_preview.length > 200 && (
                                <button
                                  className="rp-expand-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedResponse(expandedResponse === attack.id ? null : attack.id);
                                  }}
                                >
                                  {expandedResponse === attack.id ? 'Collapse' : 'View Full Content'}
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rp-section">
            <div className="rp-label">Components Used:</div>
            <div className="rp-box">
              <div className="rp-components-section">
                <div className="rp-components-header">Input Components:</div>
                {actionInfo.input_components.map((componentId: string, index: number) => {
                  const component = componentMap[componentId];
                  return component ? (
                    <div key={index} className={`rp-component-item ${component.risk > 0.5 ? 'high-risk-border' : ''}`}>
                      <span className="rp-component-type">{component.type}:</span>
                      <span className="rp-component-name">{component.name}</span>
                      <span className={`rp-component-risk ${getRiskClass(component.risk)}`}>
                        {Math.round(component.risk * 100)}%
                      </span>
                    </div>
                  ) : null;
                })}
              </div>
              <div className="rp-components-section">
                <div className="rp-components-header">Output Components:</div>
                {actionInfo.output_components.map((componentId: string, index: number) => {
                  const component = componentMap[componentId];
                  return component ? (
                    <div key={index} className={`rp-component-item ${component.risk > 0.5 ? 'high-risk-border' : ''}`}>
                      <span className="rp-component-type">{component.type}:</span>
                      <span className="rp-component-name">{component.name}</span>
                      <span className={`rp-component-risk ${getRiskClass(component.risk)}`}>
                        {Math.round(component.risk * 100)}%
                      </span>
                    </div>
                  ) : null;
                })}
              </div>
            </div>

            <div className="rp-label" style={{ marginTop: '20px' }}>Input Messages:</div>
            <div className="rp-box" style={{ minHeight: 100 }}>
              {actionInfo.input.map((message: Message, index: number) => (
                <div key={index} className="rp-message-item">
                  <div className="rp-message-type">{message.type}</div>
                  <div className="rp-message-content">
                    {message.content ? renderContent(message.content) : (message.type === 'ai' && 
                      ((message.tool_calls && message.tool_calls.length > 0) || (message.additional_kwargs?.tool_calls && message.additional_kwargs.tool_calls.length > 0))
                      ? `Calling tool: ${message.tool_calls?.[0]?.name || message.additional_kwargs?.tool_calls?.[0]?.function?.name || 'Unknown Tool'}`
                      : renderContent(message.content))
                    }
                  </div>
                  {((message.tool_calls && message.tool_calls.length > 0) || (message.additional_kwargs?.tool_calls && message.additional_kwargs.tool_calls.length > 0)) && (
                    <div className="rp-tool-calls">
                      {(message.tool_calls || message.additional_kwargs?.tool_calls || []).map((call: ToolCall, idx: number) => {
                        // Get tool name and args based on message type
                        const toolName = call?.name || call?.function?.name || 'Unknown Tool';
                        const toolArgs = call?.args || call?.function?.arguments || {};
                        
                        return (
                          <div key={idx} className="rp-tool-call">
                            <span className="rp-tool-name">{toolName}</span>
                            {Object.keys(toolArgs).length > 0 && (
                              <pre className="rp-tool-args">
                                {JSON.stringify(toolArgs, null, 2)}
                              </pre>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="rp-arrow">▼</div>

            <div className="rp-label">Output Message:</div>
            <div className="rp-box" style={{ minHeight: 100 }}>
              {actionInfo.output.generations?.[0]?.[0]?.message && (
                <div className="rp-message-item">
                  <div className="rp-message-content">
                    {actionInfo.output.generations[0][0].message.content ? 
                      renderContent(actionInfo.output.generations[0][0].message.content) : 
                     (actionInfo.output.generations[0][0].message.additional_kwargs?.tool_calls?.length
                      ? `Calling tool: ${actionInfo.output.generations[0][0].message.additional_kwargs.tool_calls[0]?.function?.name || 'Unknown Tool'}`
                      : renderContent(actionInfo.output.generations[0][0].message.content))
                    }
                  </div>
                  {actionInfo.output.generations[0][0].message.additional_kwargs?.tool_calls?.length && (
                    <div className="rp-tool-calls">
                      {actionInfo.output.generations[0][0].message.additional_kwargs.tool_calls.map((call: ToolCall, idx: number) => {
                        const toolName = call?.function?.name || 'Unknown Tool';
                        const toolArgs = call?.function?.arguments || {};
                        
                        return (
                          <div key={idx} className="rp-tool-call">
                            <span className="rp-tool-name">{toolName}</span>
                            {Object.keys(toolArgs).length > 0 && (
                              <pre className="rp-tool-args">
                                {JSON.stringify(toolArgs, null, 2)}
                              </pre>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {agentInfo && (
        <>
          <div className="rp-section">
            <div className="rp-header-info">
              <div className="rp-header-main">
                <div className="rp-label">Agent Name:</div>
                <div className="rp-value">{agentInfo.name}</div>
              </div>
              <div className="rp-header-stats">
                <div className="rp-stat">
                  <div className="rp-stat-label">Model:</div>
                  <div className="rp-stat-value">{agentInfo.model}</div>
                </div>
                <div className="rp-stat">
                  <div className="rp-stat-label">Risk Score:</div>
                  <div className={`rp-stat-value ${agentInfo.risk > 0.7 ? 'high-risk' : agentInfo.risk > 0.3 ? 'medium-risk' : 'low-risk'}`}>
                    {Number(agentInfo.risk).toFixed(3)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="rp-section">
            <div className="rp-content-box">
              <div className="rp-content-header">System Prompt</div>
              <div className="rp-content-body">
                <pre>{agentInfo.system_prompt}</pre>
              </div>
            </div>
          </div>
        </>
      )}

      {memoryOpInfo && (
        <>
          <div className="rp-section">
            <div className="rp-header-info">
              <div className="rp-op-badge-row">
                <span className={`op-node op-${memoryOpInfo.op}`}>
                  <span className="op-node-glyph">{VERB_GLYPH[memoryOpInfo.op] ?? '•'}</span>
                  <span className="op-node-verb">{memoryOpInfo.op}</span>
                </span>
              </div>
              <div className="rp-header-main">
                <div className="rp-label">Actor:</div>
                <div className="rp-value">{memoryOpInfo.actor}</div>
                <div className="rp-label">Native call:</div>
                <div className="rp-value">{memoryOpInfo.native_call}</div>
                <div className="rp-label">Store touched:</div>
                <div className="rp-value">{memoryOpInfo.store_name}</div>
                {memoryOpInfo.retrieval_method && (
                  <>
                    <div className="rp-label">Retrieval method:</div>
                    <div className="rp-value">{memoryOpInfo.retrieval_method}</div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="rp-section">
            <div className="rp-content-box">
              <div className="rp-content-header">{beforeAfterHeader(memoryOpInfo.op)}</div>
              {renderBeforeAfter(memoryOpInfo)}
            </div>

            {memoryOpInfo.native_details && Object.keys(memoryOpInfo.native_details).length > 0 && (
              <div className="rp-content-box">
                <div className="rp-content-header">Backend details</div>
                {renderNativeDetails(memoryOpInfo.native_details)}
              </div>
            )}
          </div>
        </>
      )}

      {memoryStoreInfo && (
        <div className="rp-section">
          <div className="rp-header-info">
            <div className="rp-header-main">
              <div className="rp-label">Store Name:</div>
              <div className="rp-value">{memoryStoreInfo.name}</div>
            </div>
          </div>

          <div className="rp-content-box">
            <div className="rp-content-header">Store Attributes</div>
            <div className="rp-content-body">
              <div className="rp-nd-row"><div className="rp-label">Locus</div><div className="rp-nd-value">{memoryStoreInfo.locus}</div></div>
              <div className="rp-nd-row"><div className="rp-label">Substrate</div><div className="rp-nd-value">{memoryStoreInfo.substrate}</div></div>
              <div className="rp-nd-row"><div className="rp-label">Persistence</div><div className="rp-nd-value">{memoryStoreInfo.persistence}</div></div>
              <div className="rp-nd-row"><div className="rp-label">Scope</div><div className="rp-nd-value">{memoryStoreInfo.scope}</div></div>
              <div className="rp-nd-row"><div className="rp-label">Retrieval method</div><div className="rp-nd-value">{memoryStoreInfo.retrieval_method}</div></div>
              {memoryStoreInfo.agent && (
                <div className="rp-nd-row"><div className="rp-label">Owning agent</div><div className="rp-nd-value">{memoryStoreInfo.agent}</div></div>
              )}
            </div>
          </div>

          {memoryStoreInfo.risk !== undefined && (
            <div className="rp-content-box">
              <div className="rp-content-header">Demo Metric</div>
              <div className="rp-content-body">
                <div className="rp-value">Risk: {Number(memoryStoreInfo.risk).toFixed(3)} (demo figure — not a store property)</div>
              </div>
            </div>
          )}
        </div>
      )}

      {toolInfo && (
        <div className="rp-section">
          <div className="rp-header-info">
            <div className="rp-header-main">
              <div className="rp-label">Tool Name:</div>
              <div className="rp-value">{toolInfo.tool_name}</div>
            </div>
            <div className="rp-header-stats">
              <div className="rp-stat">
                <div className="rp-stat-label">Risk Score:</div>
                <div className={`rp-stat-value ${toolInfo.risk > 0.7 ? 'high-risk' : toolInfo.risk > 0.3 ? 'medium-risk' : 'low-risk'}`}>
                  {Number(toolInfo.risk).toFixed(3)}
                </div>
              </div>
            </div>
          </div>

          <div className="rp-content-box">
            <div className="rp-content-header">Description</div>
            <div className="rp-content-body">
              <pre>{toolInfo.description}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RightPanel; 