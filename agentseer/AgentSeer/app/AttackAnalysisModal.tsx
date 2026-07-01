import React, { useState, useEffect } from 'react';

interface AttackDetails {
  model_info: {
    name: string;
    version: string;
    provider: string;
  };
  attack_categories: Record<string, {
    description: string;
    success_rate: number;
    technique: string;
  }>;
  vulnerability_findings: Array<{
    id: string;
    title: string;
    severity: number;
    breadth: number;
    attack_level: string;
    description: string;
  }>;
  attack_comparison: {
    model_level: { average_ASR: number; description: string };
    agentic_level: { average_ASR: number; description: string };
    key_insight: string;
  };
  successful_attacks: Array<{
    id: string;
    objective: string;
    category: string;
    rating: number;
    prompt: string;
    response_preview: string;
  }>;
  injection_strategies: Record<string, {
    description: string;
    avg_ASR_gpt: number;
    avg_ASR_gemini: number;
  }>;
  tool_risk_ranking: Array<{
    tool: string;
    ASR: number;
  }>;
}

interface AttackAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AttackAnalysisModal: React.FC<AttackAnalysisModalProps> = ({ isOpen, onClose }) => {
  const [attackDetails, setAttackDetails] = useState<AttackDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      fetch('/attack_details.json')
        .then(res => res.json())
        .then(data => {
          setAttackDetails(data);
          setIsLoading(false);
        })
        .catch(err => {
          console.error('Failed to load attack details:', err);
          setIsLoading(false);
        });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          width: '90%',
          maxWidth: '900px',
          maxHeight: '85vh',
          overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
          position: 'relative'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #e0e0e0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          backgroundColor: 'white',
          zIndex: 1
        }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#333' }}>
            Attack Analysis Overview
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#666',
              padding: '4px 8px',
              borderRadius: '4px'
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f0f0'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px' }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
              Loading attack analysis...
            </div>
          ) : attackDetails ? (
            <>
              {/* Model vs Agentic Comparison */}
              <div style={{ marginBottom: '24px', padding: '20px', backgroundColor: '#fff3cd', borderRadius: '10px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '12px', color: '#856404', fontSize: '1.1rem' }}>
                  Attack Level Comparison
                </div>
                <div style={{ display: 'flex', gap: '30px', fontSize: '1rem' }}>
                  <div style={{ flex: 1, textAlign: 'center', padding: '15px', backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: '8px' }}>
                    <div style={{ color: '#666', marginBottom: '8px', fontSize: '0.9rem' }}>Model-Level ASR</div>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#28a745' }}>
                      {(attackDetails.attack_comparison.model_level.average_ASR * 100).toFixed(0)}%
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '8px' }}>
                      {attackDetails.attack_comparison.model_level.description}
                    </div>
                  </div>
                  <div style={{ flex: 1, textAlign: 'center', padding: '15px', backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: '8px' }}>
                    <div style={{ color: '#666', marginBottom: '8px', fontSize: '0.9rem' }}>Agentic-Level ASR</div>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#dc3545' }}>
                      {(attackDetails.attack_comparison.agentic_level.average_ASR * 100).toFixed(0)}%
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '8px' }}>
                      {attackDetails.attack_comparison.agentic_level.description}
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: '16px', fontSize: '0.95rem', color: '#856404', fontStyle: 'italic', lineHeight: '1.5', textAlign: 'center' }}>
                  {attackDetails.attack_comparison.key_insight}
                </div>
              </div>

              {/* Attack Categories */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '12px', fontSize: '1.1rem', color: '#333' }}>
                  Attack Categories Used
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                  {Object.entries(attackDetails.attack_categories).map(([name, category]) => (
                    <div key={name} style={{ padding: '16px', backgroundColor: '#f8f9fa', borderRadius: '8px', borderLeft: '4px solid #0d47a1' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 'bold', color: '#0d47a1', fontSize: '1rem' }}>{name}</span>
                        <span style={{
                          fontSize: '0.85rem',
                          padding: '5px 12px',
                          backgroundColor: category.success_rate > 0.6 ? '#dc3545' : '#ffc107',
                          color: category.success_rate > 0.6 ? 'white' : 'black',
                          borderRadius: '12px',
                          fontWeight: '600'
                        }}>
                          {(category.success_rate * 100).toFixed(0)}% success
                        </span>
                      </div>
                      <div style={{ fontSize: '0.9rem', color: '#666', lineHeight: '1.4' }}>{category.technique}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Critical Findings */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '12px', fontSize: '1.1rem', color: '#333' }}>
                  Critical Vulnerability Findings
                </div>
                {attackDetails.vulnerability_findings
                  .filter(f => f.severity >= 7)
                  .map(finding => (
                    <div key={finding.id} style={{
                      marginBottom: '12px',
                      padding: '16px',
                      backgroundColor: finding.severity >= 9 ? '#f8d7da' : '#fff3cd',
                      borderRadius: '8px',
                      border: finding.severity >= 9 ? '1px solid #f5c6cb' : '1px solid #ffeeba'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '1rem', color: '#333' }}>{finding.title}</span>
                        <span style={{
                          fontSize: '0.85rem',
                          padding: '5px 12px',
                          backgroundColor: finding.severity >= 9 ? '#dc3545' : '#ffc107',
                          color: finding.severity >= 9 ? 'white' : 'black',
                          borderRadius: '12px',
                          fontWeight: '600'
                        }}>
                          Severity: {finding.severity}/10
                        </span>
                      </div>
                      <div style={{ fontSize: '0.9rem', color: '#555', marginTop: '8px', lineHeight: '1.5' }}>{finding.description}</div>
                      <div style={{ fontSize: '0.85rem', color: '#888', marginTop: '8px' }}>
                        Attack Level: <span style={{ fontWeight: '500' }}>{finding.attack_level}</span>
                      </div>
                    </div>
                  ))}
              </div>

              {/* Tool Risk Ranking */}
              {attackDetails.tool_risk_ranking && attackDetails.tool_risk_ranking.length > 0 && (
                <div>
                  <div style={{ fontWeight: 'bold', marginBottom: '12px', fontSize: '1.1rem', color: '#333' }}>
                    Tool Risk Ranking (by ASR)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '10px' }}>
                    {attackDetails.tool_risk_ranking.map((tool, idx) => (
                      <div key={tool.tool} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px 16px',
                        backgroundColor: idx === 0 ? '#f8d7da' : '#f8f9fa',
                        borderRadius: '8px',
                        fontSize: '0.95rem'
                      }}>
                        <span style={{ color: '#333', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            backgroundColor: idx === 0 ? '#dc3545' : '#dee2e6',
                            color: idx === 0 ? 'white' : '#666',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.8rem',
                            fontWeight: 'bold'
                          }}>
                            {idx + 1}
                          </span>
                          {tool.tool.replace(/_/g, ' ')}
                        </span>
                        <span style={{
                          fontWeight: 'bold',
                          fontSize: '1rem',
                          color: tool.ASR > 0.5 ? '#dc3545' : tool.ASR > 0.3 ? '#f57c00' : '#28a745'
                        }}>
                          {(tool.ASR * 100).toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
              No attack analysis data available
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AttackAnalysisModal;
