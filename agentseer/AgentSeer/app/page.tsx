'use client';
import React, { useState, useCallback, useEffect } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
  Panel,
  Node,
  ReactFlowInstance,
  BackgroundVariant,
  Connection,
  Edge,
  NodeMouseHandler,
  OnNodesChange,
  OnEdgesChange,
  OnInit
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import genericLLMNode from './genericLLMNode';
import AgentNode from './agentNode';
import MemoryNode from './memoryNode';
import ToolNode from './toolNode';
import HumanInputNode from './humanInputNode';
import RightPanel from './RightPanel';
import AttackAnalysisModal from './AttackAnalysisModal';
import StoreNode from './memory/storeNode';
import OpNode from './memory/opNode';
import { spliceMemoryStoreNodes } from './memory/deriveStoreNodes';
import { spliceOpNodes } from './memory/deriveOpNodes';
import type { MemoryStore, OpNodeData } from './memory/types';

const flowKey = 'example-flow';

let id = 3;
const getId = () => `${id++}`;

interface ActionNodeData extends Record<string, unknown> {
  label: string;
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

function Flow() {
  const [actionNodes, setActionNodes, onActionNodesChange] = useNodesState<Node<Record<string, unknown>, string>>([]);
  const [actionEdges, setActionEdges, onActionEdgesChange] = useEdgesState<Edge<Record<string, unknown>>>([]);
  
  const [componentNodes, setComponentNodes, onComponentNodesChange] = useNodesState<Node<Record<string, unknown>, string>>([]);
  const [componentEdges, setComponentEdges, onComponentEdgesChange] = useEdgesState<Edge<Record<string, unknown>>>([]);
  const [selectedNode, setSelectedNode] = useState<Node<Record<string, unknown>, string> | null>(null);
  const [rightPanelWidth, setRightPanelWidth] = useState(20); // Default to 20% width (minimum)
  const [leftPanelWidth, setLeftPanelWidth] = useState(50); // Default width for the left panel
  const [isDragging, setIsDragging] = useState(false);
  const [highlightedComponents, setHighlightedComponents] = useState<string[]>([]);
  // Phase 3: the ACTION panel's highlight driver, SEPARATE from highlightedComponents
  // (which drives the component panel). Holds op-node ids lit by a store-click
  // (reciprocal operates_on) or by selecting an action (its own ops, D5b). Kept
  // apart because pushing op-ids into highlightedComponents would blank the clicked
  // store (op-ids match no component node → the component effect dims everything).
  const [highlightedOps, setHighlightedOps] = useState<string[]>([]);
  const [showInputComponents, setShowInputComponents] = useState(true); // Toggle between input and output components
  const [showAttackModal, setShowAttackModal] = useState(false); // Global attack analysis modal

  // Function to update highlighted components based on current toggle state and selected node
  const updateHighlightedComponents = useCallback(() => {
    if (selectedNode && selectedNode.type === 'llm_call_node') {
      const nodeData = selectedNode.data as unknown as ActionNodeData;
      if (showInputComponents) {
        const inputComponents = nodeData.input_components || [];
        const agentId = nodeData.agent_id;
        setHighlightedComponents([...inputComponents, agentId]);
      } else {
        const outputComponents = nodeData.output_components || [];
        const agentId = nodeData.agent_id;
        setHighlightedComponents([...outputComponents, agentId]);
      }
    }
  }, [selectedNode, showInputComponents]);

  // Update highlighted components when toggle state changes
  useEffect(() => {
    updateHighlightedComponents();
  }, [updateHighlightedComponents]);

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [rfResponse, nativeResponse] = await Promise.all([
          fetch('/reactflow_graph_with_multi_trace.json'),
          fetch('/detailed_graph_langgraph_multi_trace.json'),
        ]);
        const data = await rfResponse.json();
        // Native trace supplies the authoritative memory_stores list (Phase 1) and
        // the per-action memory_ops (Phase 2, Fork C). Fall back gracefully if it
        // is missing/unparseable — the graph then renders exactly as before.
        let memoryStores: MemoryStore[] | undefined;
        let nativeActions: Array<Array<Record<string, unknown>>> | undefined;
        try {
          const nativeData = await nativeResponse.json();
          memoryStores = nativeData?.components?.memory_stores;
          nativeActions = nativeData?.actions;
        } catch {
          memoryStores = undefined;
          nativeActions = undefined;
        }
        // Combine nodes and edges from both component and action
        const actionNodes = data.action.nodes.map((node: Node<Record<string, unknown>, string>) => ({
          ...node,
          isHighlighted: highlightedComponents.includes(node.id),
          style: {
            ...node.style,
            opacity: selectedNode != null ? (((node.id) === selectedNode.id) ? 1 : 0.3) : 1,
            transition: 'opacity 0.3s ease',
          },
        }));

        // Derive-and-replace the memory subset from memory_stores before styling.
        // memory_stores is now authoritative for which memory nodes exist; the baked
        // memory_node entries are kept only when memory_stores is absent (fallback).
        const rawComponentNodes = spliceMemoryStoreNodes(
          data.component.nodes,
          memoryStores,
        ) as unknown as Node<Record<string, unknown>, string>[];
        const componentNodes = rawComponentNodes.map((node) => ({
          ...node,
          isHighlighted: highlightedComponents.includes(node.id),
          style: {
            ...node.style,
            opacity: highlightedComponents.length > 0 ? (highlightedComponents.includes(node.id) ? 1 : 0.1) : 1,
            transition: 'opacity 0.3s ease',
          },
        }));
        
        const actionEdges = data.action.edges.map((edge: Edge<Record<string, unknown>>) => ({
          ...edge,
          animated: selectedNode != null ? (((edge.source) === selectedNode.data.label) ? true : false) : false,
          style: {
            ...edge.style,
            stroke: selectedNode != null && edge.source === selectedNode.data.label ? '#0000FF' : '#AFAFAF',
            strokeWidth: selectedNode != null && edge.source === selectedNode.data.label ? 2 : 1,
            opacity: selectedNode ? (edge.source === selectedNode.data.label ? 1 : 0.3) : 1,
            transition: 'stroke 0.3s ease'
          },
        }));

        const componentEdges = data.component.edges.map((edge: Edge<Record<string, unknown>>) => ({
          ...edge,
          style: {
            ...edge.style,
            opacity: highlightedComponents.length > 0 ? (highlightedComponents.includes(edge.source) && highlightedComponents.includes(edge.target)) ? 1 : 0.2 : 1,
            stroke: highlightedComponents.length > 0 ? (highlightedComponents.includes(edge.source) && highlightedComponents.includes(edge.target)) ? '#0000FF' : '#AFAFAF' : '#AFAFAF',
            strokeWidth: highlightedComponents.length > 0 ? (highlightedComponents.includes(edge.source) && highlightedComponents.includes(edge.target)) ? 2 : 1 : 1,
            transition: 'stroke 0.3s ease'
          },
          animated: highlightedComponents.length > 0 ? (highlightedComponents.includes(edge.source) && highlightedComponents.includes(edge.target)) ? true : false : false,
        }));
        
        // Phase 2 (Fork C): derive op-node satellites from the native trace's
        // action.memory_ops and APPEND them + their tether edges. Strictly
        // additive — the backbone action nodes/edges built above are untouched;
        // if there are no memory_ops this appends nothing (back-compat).
        const { nodes: opNodes, edges: opTethers } = spliceOpNodes(
          data.action.nodes,
          nativeActions,
        );

        setActionNodes([
          ...actionNodes,
          ...(opNodes as unknown as Node<Record<string, unknown>, string>[]),
        ]);
        setActionEdges([
          ...actionEdges,
          ...(opTethers as unknown as Edge<Record<string, unknown>>[]),
        ]);
        setComponentNodes(componentNodes);
        setComponentEdges(componentEdges);
      } catch (error) {
        console.error('Failed to load initial flow data:', error);
      }
    };

    loadInitialData();
  }, []);

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // Get target nodes of edges that have selectedNode as source
        const targetNodeIds = actionEdges
          .filter(edge => edge.source === selectedNode?.data.label)
          .map(edge => edge.target);

        // Create set of active nodes (selected node + its edge targets).
        const activeNodeIds = new Set([selectedNode?.id, ...targetNodeIds]);

        // Phase 3: an op-set highlight (highlightedOps) is produced by a store-click
        // (reciprocal operates_on) or by selecting an action (its own ops, D5b).
        const opHighlightActive = highlightedOps.length > 0;
        const highlightedOpSet = new Set(highlightedOps);

        // Unified opacity rule (D3). The Phase-2 op-node exemption is now
        // CONDITIONAL: op nodes stay exempt (opacity 1) under a plain selection, but
        // dim-unless-matched once an op-set highlight is active. Non-op action nodes
        // stay lit if they are in the ordinary selection set OR are a parent action
        // of a matched op ("which actions touched this store"). Both cases share the
        // one expression below — no stacked patches.
        setActionNodes(nodes => {
          const litActionIds = new Set<string | undefined>(activeNodeIds);
          for (const n of nodes) {
            if (n.type === 'memory_op_node' && highlightedOpSet.has(n.id)) {
              litActionIds.add((n.data as unknown as OpNodeData).parentActionId);
            }
          }
          return nodes.map(node => {
            let opacity: number;
            if (node.type === 'memory_op_node') {
              opacity = opHighlightActive ? (highlightedOpSet.has(node.id) ? 1 : 0.3) : 1;
            } else {
              const anyHighlight = selectedNode != null || opHighlightActive;
              opacity = anyHighlight ? (litActionIds.has(node.id) ? 1 : 0.3) : 1;
            }
            return {
              ...node,
              isHighlighted: highlightedComponents.includes(node.id),
              style: { ...node.style, opacity, transition: 'opacity 0.3s ease' },
            };
          });
        });

        const actionEdges_ = actionEdges.map(edge => ({
          ...edge,
          animated: selectedNode != null ? (((edge.source) === selectedNode.data.label) ? true : false) : false,
          style: {
            ...edge.style,
            stroke: selectedNode != null && edge.source === selectedNode.data.label ? '#0000FF' : '#AFAFAF',
            strokeWidth: selectedNode != null && edge.source === selectedNode.data.label ? 2 : 1,
            opacity: selectedNode ? (edge.source === selectedNode.data.label ? 1 : 0.3) : 1,
            transition: 'stroke 0.3s ease'
          },
        }));

        setActionEdges(actionEdges_);

      } catch (error) {
        console.error('Failed to load initial flow data:', error);
      }
    };

    loadInitialData();
  }, [selectedNode, highlightedComponents, highlightedOps]);

  useEffect(() => {
    const loadInitialData = async () => {
      try {

        const componentNodes_ = componentNodes.map(node => ({
          ...node,
          isHighlighted: highlightedComponents.includes(node.id),
          style: {
            ...node.style,
            opacity: highlightedComponents.length > 0 ? (highlightedComponents.includes(node.id) ? 1 : 0.1) : 1,
            transition: 'opacity 0.3s ease',
          }
        }));

        const componentEdges_ = componentEdges.map(edge => ({
          ...edge,
          animated: highlightedComponents.length > 0 ? (highlightedComponents.includes(edge.source) && highlightedComponents.includes(edge.target)) ? true : false : false,
          style: {
            ...edge.style,
            opacity: highlightedComponents.length > 0 ? (highlightedComponents.includes(edge.source) && highlightedComponents.includes(edge.target)) ? 1 : 0.2 : 1,
            stroke: highlightedComponents.length > 0 ? (highlightedComponents.includes(edge.source) && highlightedComponents.includes(edge.target)) ? '#0000FF' : '#AFAFAF' : '#AFAFAF',
            strokeWidth: highlightedComponents.length > 0 ? (highlightedComponents.includes(edge.source) && highlightedComponents.includes(edge.target)) ? 2 : 1 : 1,
            transition: 'stroke 0.3s ease',
            animationDirection: showInputComponents ? 'reverse' : 'normal'
          },
          
        }));
        
        setComponentNodes(componentNodes_);
        setComponentEdges(componentEdges_);
      } catch (error) {
        console.error('Failed to load initial flow data:', error);
      }
    };
    loadInitialData();
  }, [highlightedComponents, showInputComponents]);

  // Clearing discipline (D4): EVERY branch fully overwrites BOTH highlight atoms so
  // neither panel can keep a stale highlight. Symmetric rule — op-click sets
  // highlightedComponents + clears highlightedOps; store-click sets highlightedOps +
  // clears highlightedComponents; action-select sets both (its components + its own
  // ops); every other branch clears both.
  const onNodeClick: NodeMouseHandler = useCallback((event, node) => {
    if (node.type === 'llm_call_node') {
      const nodeData = node.data as unknown as ActionNodeData;
      if (showInputComponents) {
        const inputComponents = nodeData.input_components || [];
        const agentId = nodeData.agent_id;
        setHighlightedComponents([...inputComponents, agentId]);
      } else {
        const outputComponents = nodeData.output_components || [];
        const agentId = nodeData.agent_id;
        setHighlightedComponents([...outputComponents, agentId]);
      }
      // D5b: light this action's OWN op satellites (op nodes tethered to it).
      const ownOps = actionNodes
        .filter(n => n.type === 'memory_op_node'
          && (n.data as unknown as OpNodeData).parentActionId === node.id)
        .map(n => n.id);
      setHighlightedOps(ownOps);
      setSelectedNode(node);
    } else if (node.type === 'agent_node') {
      // Find all components connected to this agent
      const agentId = node.id;
      const connectedComponents: string[] = [agentId]; // Include the agent itself

      // Find connected tools and memories via component edges
      componentEdges.forEach(edge => {
        if (edge.source === agentId) {
          connectedComponents.push(edge.target);
        }
      });

      // Find action nodes that use this agent
      actionNodes.forEach(actionNode => {
        if (actionNode.data && actionNode.data.agent_id === agentId) {
          connectedComponents.push(actionNode.id);
        }
      });

      setHighlightedComponents(connectedComponents);
      setHighlightedOps([]);
      setSelectedNode(node);
    } else if (node.type === 'memory_node') {
      setHighlightedComponents([]);
      setHighlightedOps([]);
      setSelectedNode(node);
    } else if (node.type === 'memory_store_node') {
      // D2 reciprocal (operates_on): light every op that touched this store
      // (store id === store.label === op.store_label), and — via the opacity rule —
      // their parent actions. Clear highlightedComponents so the clicked store stays
      // lit in its own panel (component effect: no-highlight ⇒ all opacity 1).
      const touchingOps = actionNodes
        .filter(n => n.type === 'memory_op_node'
          && (n.data as unknown as OpNodeData).op.store_label === node.id)
        .map(n => n.id);
      setHighlightedComponents([]);
      setHighlightedOps(touchingOps);
      setSelectedNode(node);
    } else if (node.type === 'memory_op_node') {
      // D1 forward (operates_on): light the store this op touched in the component
      // panel (store node id === store.label). Store only — no agent id (v1).
      const storeLabel = (node.data as unknown as OpNodeData).op.store_label;
      setHighlightedComponents([storeLabel]);
      setHighlightedOps([]);
      setSelectedNode(node);
    } else if (node.type === 'tool_node') {
      setHighlightedComponents([]);
      setHighlightedOps([]);
      setSelectedNode(node);
    } else {
      // Clear highlights when clicking any other node type
      setHighlightedComponents([]);
      setHighlightedOps([]);
      setSelectedNode(null);
    }
  }, [showInputComponents, componentEdges, actionNodes]);

  const onEdgeClick = useCallback((event: React.MouseEvent) => {
    // Don't dehighlight if clicking on the toggle button
    if ((event.target as Element)?.closest('.component-toggle')) {
      return;
    }
    setHighlightedComponents([]);
    setHighlightedOps([]);
    setSelectedNode(null);
  }, []);

  const onPaneClick = useCallback((event: React.MouseEvent) => {
    // Don't dehighlight if clicking on the toggle button
    if ((event.target as Element)?.closest('.component-toggle')) {
      return;
    }
    setHighlightedComponents([]);
    setHighlightedOps([]);
    setSelectedNode(null);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging) {
      const newWidth = (e.clientX / window.innerWidth) * 100;
      setLeftPanelWidth(Math.max(20, Math.min(80, newWidth))); // Limit width between 20% and 80%
    }
  }, [isDragging]);

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

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex' }}>
      <ReactFlowProvider>
        <div style={{ width: `${leftPanelWidth}%`, height: '100%', position: 'relative' }}>
          <ReactFlow
            nodes={componentNodes}
            edges={componentEdges}
            onNodesChange={onComponentNodesChange}
            onEdgesChange={onComponentEdgesChange}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            fitView
            minZoom={0.05}
            nodeTypes={{ 
              llm_call_node: genericLLMNode,
              agent_node: AgentNode,
              memory_node: MemoryNode,
              memory_store_node: StoreNode,
              memory_op_node: OpNode,
              tool_node: ToolNode,
              human_input_node: HumanInputNode
            }}
            style={{ backgroundColor: '#f9f9f9' }}
          >
            <Controls />
            <MiniMap />
            <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
            <Panel position="top-left" className="component-toggle">
              <button
                onClick={() => setShowInputComponents(!showInputComponents)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: showInputComponents ? '#007bff' : '#ffc107',
                  color: showInputComponents ? 'white' : 'black',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  transition: 'background-color 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = showInputComponents ? '#0056b3' : '#e6ad06';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = showInputComponents ? '#007bff' : '#ffc107';
                }}
              >
                {showInputComponents ? 'Showing Action Input Components' : 'Showing Action Output Components'}
              </button>
            </Panel>
          </ReactFlow>
        </div>
      </ReactFlowProvider>

      <div
        style={{
          width: '4px',
          height: '100%',
          backgroundColor: '#ccc',
          cursor: 'col-resize',
          position: 'relative',
          zIndex: 10,
        }}
        onMouseDown={handleMouseDown}
      />

      <ReactFlowProvider>
        <div style={{ width: `${100 - leftPanelWidth - rightPanelWidth}%`, height: '100%' }}>
          <ReactFlow
            nodes={actionNodes}
            edges={actionEdges}
            onNodesChange={onActionNodesChange}
            onEdgesChange={onActionEdgesChange}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            fitView
            minZoom={0.05}
            nodeTypes={{ 
              llm_call_node: genericLLMNode,
              agent_node: AgentNode,
              memory_node: MemoryNode,
              memory_store_node: StoreNode,
              memory_op_node: OpNode,
              tool_node: ToolNode,
              human_input_node: HumanInputNode
            }}
            style={{ backgroundColor: '#f9f9f9' }}
          >
            <Controls />
            <MiniMap />
            <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
          </ReactFlow>
        </div>
      </ReactFlowProvider>
      <RightPanel selectedNode={selectedNode} width={rightPanelWidth} setWidth={setRightPanelWidth} />

      {/* Global Attack Analysis Button */}
      <button
        onClick={() => setShowAttackModal(true)}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          padding: '14px 20px',
          backgroundColor: '#dc3545',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: 'bold',
          boxShadow: '0 4px 12px rgba(220, 53, 69, 0.4)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          zIndex: 100,
          transition: 'transform 0.2s, box-shadow 0.2s'
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'scale(1.05)';
          e.currentTarget.style.boxShadow = '0 6px 16px rgba(220, 53, 69, 0.5)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(220, 53, 69, 0.4)';
        }}
      >
        <span style={{ fontSize: '18px' }}>⚠</span>
        Attack Analysis
      </button>

      {/* Attack Analysis Modal */}
      <AttackAnalysisModal isOpen={showAttackModal} onClose={() => setShowAttackModal(false)} />
    </div>
  );
}

export default function Page() {
  return (
    <ReactFlowProvider>
      <Flow />
    </ReactFlowProvider>
  );
}
