import React from 'react'
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, ResponsiveContainer, Tooltip, Area, AreaChart, LabelList } from 'recharts'

const COLORS = { attack: '#ff3b3b', benign: '#3fb950', warn: '#d29922' }

const PIE_COLORS = ['#3fb950', '#ff3b3b', '#58a6ff', '#d29922', '#bc8cff', '#f0883e', '#79c0ff', '#ff7b72', '#a5d6ff', '#ffa657', '#c9d1d9', '#7ee787', '#e3b341']

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload) return null
  return (
    <div className="bg-dark-700 border border-dark-400 rounded px-2 py-1 text-xs font-mono">
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }}>{p.name}: {typeof p.value === 'number' ? p.value.toFixed(2) : p.value}</div>
      ))}
    </div>
  )
}

function ConfidenceGauge({ confidence }) {
  const r = 40
  const cx = 50
  const cy = 50
  const dashArray = 2 * Math.PI * r
  const dashOffset = dashArray * (1 - (confidence || 0))
  const color = confidence > 0.7 ? '#ff3b3b' : confidence > 0.4 ? '#d29922' : '#3fb950'

  return (
    <svg viewBox="0 0 100 60" className="w-full h-16">
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy}`} fill="none" stroke="#21262d" strokeWidth="8" />
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy}`} fill="none" stroke={color} strokeWidth="8"
        strokeDasharray={dashArray} strokeDashoffset={dashOffset} strokeLinecap="round" />
      <text x={cx} y={cy + 4} textAnchor="middle" fill="#c9d1d9" fontSize="14" fontFamily="monospace" fontWeight="bold">
        {(confidence * 100).toFixed(0)}%
      </text>
      <text x={cx} y={cy + 20} textAnchor="middle" fill="#8b949e" fontSize="8" fontFamily="monospace">Confidence</text>
    </svg>
  )
}

export default function MLMonitor({ stats, trafficHistory, attackTypeCounts, recentPacket }) {
  const confidence = recentPacket?.confidence || 0
  const isAttack = recentPacket?.is_attack_predicted

  const chartData = trafficHistory.slice(-60).map(p => ({
    time: p.time,
    confidence: p.confidence,
    attack: p.attack,
  }))

  const pieData = Object.entries(attackTypeCounts).map(([name, value]) => ({ name, value }))
  const pieTotal = pieData.reduce((s, e) => s + e.value, 0)

  const importanceData = (recentPacket?.feature_importance || []).map(f => ({
    name: f.feature?.replace(/_/g, ' ').slice(0, 18),
    importance: f.importance || 0,
    value: f.value || 0,
  }))
  if (importanceData.length > 0) console.log('Feature importance values:', importanceData.map(f => `${f.name}: ${f.importance.toFixed(10)} (raw: ${f.importance})`))

  return (
    <div className="w-72 bg-dark-700 border-l border-dark-500 flex flex-col overflow-hidden shrink-0">
      <div className="p-3 border-b border-dark-500">
        <h2 className="text-xs font-bold text-dark-50 font-mono tracking-wider uppercase">ML Monitor</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">

        <div className="bg-dark-800 rounded border border-dark-500 p-2.5">
          <div className="text-xs text-dark-300 font-mono mb-1">Model Confidence</div>
          <ConfidenceGauge confidence={confidence} />
          <div className="flex justify-center mt-1">
            <span className={`text-xs font-mono px-2 py-0.5 rounded ${
              isAttack ? 'bg-attack/20 text-attack' : 'bg-benign/20 text-benign'
            }`}>
              {isAttack ? '🔴 ATTACK DETECTED' : '🟢 BENIGN'}
            </span>
          </div>
        </div>

        <div className="bg-dark-800 rounded border border-dark-500 p-2.5">
          <div className="text-xs text-dark-300 font-mono mb-1.5">Confidence Timeline</div>
          <ResponsiveContainer width="100%" height={80}>
              <AreaChart data={chartData}>
                <XAxis hide />
                <defs>
                <linearGradient id="confGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ff3b3b" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#ff3b3b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="confidence" stroke="#ff3b3b" fill="url(#confGrad)" strokeWidth={1.5} dot={false} />
              <Tooltip content={<CustomTooltip />} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {pieData.length > 0 && (
          <div className="bg-dark-800 rounded border border-dark-500 p-2.5">
            <div className="text-xs text-dark-300 font-mono mb-1.5">Attack Types</div>
            <ResponsiveContainer width="100%" height={100}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={25} outerRadius={40} paddingAngle={2} dataKey="value">
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-x-2 gap-y-1 mt-2">
              {pieData.map((entry, i) => (
                <div key={entry.name} className="flex items-center gap-1 text-xs font-mono">
                  <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-dark-400">{entry.name}</span>
                  <span className="text-dark-200">{((entry.value / pieTotal) * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {importanceData.length > 0 && (
          <div className="bg-dark-800 rounded border border-dark-500 p-2.5">
            <div className="text-xs text-dark-300 font-mono mb-1.5">Feature Importance</div>
            <ResponsiveContainer width="100%" height={importanceData.length * 18 + 10}>
              <BarChart data={importanceData} layout="vertical" margin={{ top: 0, right: 5, bottom: 0, left: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={95} tick={{ fill: '#8b949e', fontSize: 9, fontFamily: 'monospace' }} />
                <Bar dataKey="importance" fill="#58a6ff" radius={[0, 2, 2, 0]} minPointSize={2}>
                  <LabelList dataKey="importance" position="right" formatter={(v) => `${(v * 100).toFixed(2)}%`} style={{ fill: '#8b949e', fontSize: 9, fontFamily: 'monospace' }} />
                </Bar>
                <Tooltip content={<CustomTooltip />} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}


      </div>
    </div>
  )
}
