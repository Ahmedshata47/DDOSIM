import React from 'react'

const REAL_LABELS = [
  'BENIGN', 'DrDoS_DNS', 'DrDoS_LDAP', 'DrDoS_MSSQL', 'DrDoS_NTP',
  'DrDoS_NetBIOS', 'DrDoS_SNMP', 'DrDoS_SSDP', 'DrDoS_UDP',
  'Syn', 'TFTP', 'UDP-lag', 'WebDDoS',
]

export default function ControlPanel({ config, setConfig, simState, onStart, onPause, onStop, stats, dataStatus, replayProgress, onConfigChange }) {
  const isRunning = simState === 'running'
  const isPaused = simState === 'paused'
  const isIdle = simState === 'idle'

  const updateConfig = (key, value) => {
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  const toggleLabel = (label) => {
    setConfig(prev => {
      const current = prev.attack_types || REAL_LABELS
      const next = current.includes(label)
        ? current.filter(l => l !== label)
        : [...current, label]
      return { ...prev, attack_types: next.length ? next : [label] }
    })
  }

  const selectAll = () => updateConfig('attack_types', [...REAL_LABELS])
  const deselectAll = () => updateConfig('attack_types', ['BENIGN'])

  const dataReady = dataStatus?.ready
  const modelReady = dataStatus?.real_model_ready
  const selectedTypes = config.attack_types || REAL_LABELS

  return (
    <div className="w-72 bg-dark-700 border-r border-dark-500 flex flex-col overflow-hidden shrink-0">
      <div className="p-3 border-b border-dark-500">
        <h2 className="text-xs font-bold text-dark-50 font-mono tracking-wider uppercase">Replay Config</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">

        <div className="bg-dark-800 rounded border border-dark-500 p-2.5 space-y-1.5">
          <div className="text-xs text-dark-300 font-mono">Dataset Status</div>
          {dataReady ? (
            <>
              <div className="text-xs text-benign font-mono">Ready</div>
              <div className="text-xs text-dark-400 font-mono">Features: {dataStatus.features?.length || '?'}</div>
              <div className="text-xs text-dark-400 font-mono">Test rows: {dataStatus.test_rows?.toLocaleString() || '?'}</div>
              {modelReady ? (
                <div className="text-xs text-benign font-mono">Model trained on real data</div>
              ) : (
                <div className="text-xs text-yellow-400 font-mono">Run: python model/train_real.py</div>
              )}
            </>
          ) : (
            <div className="text-xs text-yellow-400 font-mono">Dataset not prepared</div>
          )}
        </div>

        <div>
          <label className="text-xs text-dark-300 font-mono block mb-1.5">
            Attack Types <span className="text-dark-400">({selectedTypes.length}/{REAL_LABELS.length})</span>
          </label>
          <div className="flex gap-1 mb-1.5">
            <button onClick={selectAll} className="text-xs text-dark-300 font-mono hover:text-dark-50 bg-dark-600 px-1.5 py-0.5 rounded border border-dark-400">All</button>
            <button onClick={deselectAll} className="text-xs text-dark-300 font-mono hover:text-dark-50 bg-dark-600 px-1.5 py-0.5 rounded border border-dark-400">Benign Only</button>
          </div>
          <div className="max-h-40 overflow-y-auto space-y-0.5">
            {REAL_LABELS.map(label => (
              <label key={label} className="flex items-center gap-1.5 cursor-pointer py-0.5 px-1 rounded hover:bg-dark-600 transition-colors">
                <input
                  type="checkbox"
                  checked={selectedTypes.includes(label)}
                  onChange={() => toggleLabel(label)}
                  className="accent-purple-500 w-3 h-3"
                />
                <span className={`text-xs font-mono ${label === 'BENIGN' ? 'text-benign' : 'text-attack'}`}>{label}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-dark-300 font-mono block mb-1.5">
            Replay Speed: <span className="text-dark-50 font-bold">{config.packet_rate}x</span>
          </label>
          <input
            type="range"
            min="10"
            max="500"
            value={config.packet_rate}
            onChange={(e) => updateConfig('packet_rate', parseInt(e.target.value))}
            className="w-full accent-purple-500 h-1.5 rounded-full appearance-none bg-dark-500 cursor-pointer"
          />
          <div className="flex justify-between text-xs text-dark-400 font-mono mt-0.5">
            <span>0.1x</span>
            <span>5x</span>
          </div>
        </div>

        <div>
          <label className="text-xs text-dark-300 font-mono block mb-1.5">ML Model</label>
          <div className="text-xs bg-dark-600 border border-dark-400 text-benign font-mono py-2 px-2 rounded text-center">
            Random Forest
          </div>
        </div>

        <div className="bg-dark-800 rounded border border-dark-500 p-2.5">
          <div className="text-xs text-dark-300 font-mono mb-1.5">Mitigation</div>
          <button
            onClick={() => updateConfig('mitigation', !config.mitigation)}
            disabled={!isIdle}
            className={`w-full text-xs font-bold font-mono py-2 px-3 rounded transition-colors ${
              config.mitigation
                ? 'bg-benign hover:bg-benign-dark text-dark-900'
                : 'bg-dark-600 hover:bg-dark-500 text-dark-300 border border-dark-400'
            }`}
          >
            {config.mitigation ? 'ON' : 'OFF'}
          </button>
          {!isIdle && config.mitigation && (
            <div className="mt-1.5 space-y-1">
              <div className="text-xs font-mono">
                <span className="text-dark-400">Blocked IPs: </span>
                <span className="text-yellow-400">{stats.blocked_ips || 0}</span>
              </div>
              <div className="text-xs font-mono">
                <span className="text-dark-400">Dropped: </span>
                <span className="text-yellow-400">{stats.dropped_packets || 0}</span>
              </div>

            </div>
          )}
        </div>

        <div className="pt-2 border-t border-dark-500 space-y-2">
          <div className="flex gap-2">
            {isIdle ? (
              <button
                onClick={onStart}
                disabled={!dataReady || !modelReady}
                className={`flex-1 text-xs font-bold font-mono py-2.5 px-3 rounded transition-colors ${
                  !dataReady || !modelReady
                    ? 'bg-dark-500 text-dark-300 cursor-not-allowed'
                    : 'bg-benign hover:bg-benign-dark text-dark-900'
                }`}
              >
                ▶ Start Replay
              </button>
            ) : (
              <>
                <button
                  onClick={onPause}
                  className={`flex-1 text-xs font-bold font-mono py-2.5 px-3 rounded transition-colors ${
                    isPaused
                      ? 'bg-benign hover:bg-benign-dark text-dark-900'
                      : 'bg-yellow-500 hover:bg-yellow-600 text-dark-900'
                  }`}
                >
                  {isPaused ? '▶ Resume' : '⏸ Pause'}
                </button>
                <button
                  onClick={onStop}
                  className="flex-1 bg-attack hover:bg-attack-dark text-white text-xs font-bold font-mono py-2.5 px-3 rounded transition-colors"
                >
                  ⏹ Stop
                </button>
              </>
            )}
          </div>
        </div>

        {!isIdle && (
          <div className="bg-dark-800 rounded border border-dark-500 p-2.5 space-y-1.5">
            <div className="text-xs text-dark-300 font-mono">Live Stats</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <div className="text-xs font-mono">
                <span className="text-dark-400">Total: </span>
                <span className="text-dark-50">{stats.total_packets}</span>
              </div>
              <div className="text-xs font-mono">
                <span className="text-attack">Attack: </span>
                <span className="text-attack">{stats.attack_packets}</span>
              </div>
              <div className="text-xs font-mono">
                <span className="text-benign">Benign: </span>
                <span className="text-benign">{stats.benign_packets}</span>
              </div>
              <div className="text-xs font-mono">
                <span className="text-dark-400">Rate: </span>
                <span className={stats.attack_rate > 50 ? 'text-attack' : 'text-benign'}>{stats.attack_rate}%</span>
              </div>
              <div className="text-xs font-mono col-span-2">
                <span className="text-dark-400">Accuracy: </span>
                <span className={stats.accuracy >= 80 ? 'text-benign' : stats.accuracy >= 50 ? 'text-yellow-400' : 'text-attack'}>{stats.accuracy}%</span>
              </div>
            </div>
          </div>
        )}



        <div className="bg-dark-800 rounded border border-dark-500 p-2.5">
          <div className="text-xs text-dark-300 font-mono mb-1.5">Quick Tips</div>
          <ul className="text-xs text-dark-400 font-mono space-y-1">
            <li>Replaying real CIC-DDoS2019 test data</li>
            <li>Each row = real network flow</li>
            <li>Green = BENIGN, Red = ATTACK</li>
            <li>Click packets for feature details</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
