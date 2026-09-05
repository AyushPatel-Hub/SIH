import React from 'react';
import { AlertTriangle, Bell, CheckCircle } from 'lucide-react';

export default function AlertFeed({ alerts }) {
  const alertList = alerts || [];

  return (
    <div className="form-section">
      <div className="form-section-title">
        <span>Municipal Action Bulletins</span>
        <Bell size={14} color="#f59e0b" />
      </div>

      {alertList.length === 0 ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px',
            color: '#10b981',
            padding: '10px 0',
          }}
        >
          <CheckCircle size={15} />
          <span>No critical municipal warnings active. Storm conduits operating below surcharge thresholds.</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {alertList.map((alert, idx) => {
            const isCrit = alert.severity === 'CRITICAL' || alert.severity === 'HIGH';
            return (
              <div
                key={idx}
                style={{
                  backgroundColor: '#0b0f19',
                  borderLeft: `4px solid ${isCrit ? '#ef4444' : '#f59e0b'}`,
                  borderTop: '1px solid #262f3d',
                  borderRight: '1px solid #262f3d',
                  borderBottom: '1px solid #262f3d',
                  borderRadius: '4px',
                  padding: '10px 12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      color: isCrit ? '#ef4444' : '#f59e0b',
                      textTransform: 'uppercase',
                    }}
                  >
                    {alert.severity} • {alert.action_required || 'DISPATCH'}
                  </span>
                  {alert.timestamp && (
                    <span className="font-mono" style={{ fontSize: '10px', color: '#6b7280' }}>
                      {alert.timestamp}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#f9fafb', marginTop: '4px' }}>
                  {alert.headline}
                </div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '3px' }}>
                  {alert.description}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
