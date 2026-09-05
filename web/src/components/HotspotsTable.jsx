import React from 'react';
import { MapPin } from 'lucide-react';

export default function HotspotsTable({ hotspots, onSelectHotspot }) {
  if (!hotspots || Object.keys(hotspots).length === 0) {
    return (
      <div className="form-section">
        <div className="form-section-title">Critical Hotspots</div>
        <div style={{ fontSize: '12px', color: '#6b7280' }}>Loading hotspots...</div>
      </div>
    );
  }

  return (
    <div className="form-section">
      <div className="form-section-title">
        <span>Drainage Basin Landmark Hotspots</span>
        <MapPin size={14} color="#06b6d4" />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="eoc-table">
          <thead>
            <tr>
              <th>Hotspot Node</th>
              <th>AMSL</th>
              <th>Threshold</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(hotspots).map(([key, info]) => {
              const isAlert = info.current_status === 'CRITICAL_ALERT';
              return (
                <tr
                  key={key}
                  style={{ cursor: 'pointer' }}
                  onClick={() => onSelectHotspot && onSelectHotspot(key, info)}
                  title="Click to locate on 3D map"
                >
                  <td style={{ fontWeight: 600 }}>{info.name}</td>
                  <td className="font-mono" style={{ color: '#9ca3af' }}>
                    {info.baseline_elevation_m}m
                  </td>
                  <td className="font-mono" style={{ color: '#9ca3af' }}>
                    {info.critical_depth_threshold_m}m
                  </td>
                  <td>
                    <span
                      className="status-pill"
                      style={{
                        backgroundColor: isAlert ? '#7f1d1d' : '#064e3b',
                        color: isAlert ? '#f87171' : '#34d399',
                        border: 'none',
                        fontSize: '10px',
                        padding: '2px 6px',
                      }}
                    >
                      {isAlert ? 'CRITICAL' : 'NORMAL'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
