import React, { useState, useEffect } from 'react';
import { Activity, RefreshCw, Sliders, Shield, Radio, CheckCircle2 } from 'lucide-react';

export default function Header({
  activeMode,
  setActiveMode,
  onSyncLiveWeather,
  isSyncing,
  systemStatus,
  lastSyncTime,
}) {
  const [timeStr, setTimeStr] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }) + ' IST'
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="eoc-header">
      <div className="eoc-brand">
        <div className="eoc-emblem">LMC</div>
        <div className="eoc-title-block">
          <h1>Urban Flood Nowcasting EOC</h1>
          <p>Lucknow Municipal Corporation • Jankipuram Sector Basin</p>
        </div>
      </div>

      <div className="eoc-header-actions">
        {/* Mode Toggle Switch */}
        <div className="mode-toggle-group">
          <button
            className={`mode-toggle-btn ${activeMode === 'live' ? 'active' : ''}`}
            onClick={() => setActiveMode('live')}
            title="Auto-feed live rainfall telemetry directly to database"
          >
            <Radio size={13} className={activeMode === 'live' ? 'text-sky-400' : ''} />
            Live Auto Feed (DB)
          </button>
          <button
            className={`mode-toggle-btn ${activeMode === 'sim' ? 'active' : ''}`}
            onClick={() => setActiveMode('sim')}
            title="Interactive storm cloudburst scenario simulation"
          >
            <Sliders size={13} />
            Scenario Simulator
          </button>
        </div>

        {/* Sync Now Button */}
        <button
          className="btn-primary"
          onClick={onSyncLiveWeather}
          disabled={isSyncing}
          title="Force immediate live weather query and database update"
        >
          <RefreshCw size={13} className={isSyncing ? 'animate-spin' : ''} />
          {isSyncing ? 'Syncing...' : 'Sync Weather'}
        </button>

        {/* Status Pill */}
        <div className="status-pill live">
          <span className="live-beacon"></span>
          <span>LIVE DB INGEST</span>
        </div>

        {/* Digital Clock */}
        <div className="font-mono" style={{ fontSize: '13px', color: '#9ca3af', fontWeight: 600 }}>
          {timeStr}
        </div>
      </div>
    </header>
  );
}
