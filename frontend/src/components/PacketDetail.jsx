import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const FEATURE_LABELS = {
  'Flow Bytes/s': 'Flow Bytes/s',
  'SYN Flag Count': 'SYN Flag Count',
  'Packet Length Mean': 'Packet Length Mean',
  'Total Fwd Packets': 'Total Fwd Packets',
  'Flow Duration': 'Flow Duration',
  'Fwd Packet Length Mean': 'Fwd Pkt Len Mean',
}

function ImportanceBar({ label, value, importance, maxImportance }) {
  const pct = maxImportance > 0 ? (importance / maxImportance) * 100 : 0
  const level = pct > 70 ? 'HIGH' : pct > 40 ? 'MED' : 'LOW'
  const color = level === 'HIGH' ? '#ff3b3b' : level === 'MED' ? '#d29922' : '#3fb950'

  return (
    <div className="flex items-center gap-2 py-1.5">
      <div className="w-28 text-xs text-dark-300 font-mono shrink-0">{label}</div>
      <div className="flex-1 h-3 bg-dark-600 rounded overflow-hidden">
        <div className="h-full rounded transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <div className="w-16 text-xs text-right font-mono" style={{ color }}>
        {level}
      </div>
    </div>
  )
}

export default function PacketDetail({ packet, onClose }) {
  if (!packet) return null

  const features = packet.features || {}
  const featureImportance = packet.feature_importance || []
  const topFeatures = featureImportance.slice(0, 5)
  const maxImportance = Math.max(...topFeatures.map(f => f.importance), 0.001)

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-start justify-center pt-16"
      >
        <div className="absolute inset-0 bg-black/60" onClick={onClose} />

        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          className="relative bg-dark-700 border border-dark-400 rounded-lg shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-dark-500">
            <div className="flex items-center gap-2">
              <span className="text-lg">📦</span>
              <h3 className="text-sm font-bold font-mono text-dark-50">
                Packet {packet.packet_id || '#'}
              </h3>
              <span className={`text-xs font-mono px-2 py-0.5 rounded ${
                packet.is_attack_predicted
                  ? 'bg-attack/20 text-attack'
                  : 'bg-benign/20 text-benign'
              }`}>
                {packet.is_attack_predicted ? 'FLAGGED AS ATTACK' : 'BENIGN'}
              </span>
            </div>
            <button onClick={onClose} className="text-dark-300 hover:text-dark-50 text-lg leading-none">&times;</button>
          </div>

          <div className="p-4 space-y-4">
            <div className="bg-dark-800 rounded border border-dark-500 p-3">
              <div className="text-xs text-dark-300 font-mono mb-2">Feature Importance</div>
              <div className="text-xs text-dark-400 font-mono mb-2">
                Model: {packet.model_used || 'Random Forest'} | Confidence: {(packet.confidence * 100).toFixed(1)}%
              </div>
              {topFeatures.length > 0 ? (
                topFeatures.map((f, i) => (
                  <ImportanceBar
                    key={i}
                    label={FEATURE_LABELS[f.feature] || f.feature}
                    value={f.value}
                    importance={f.importance}
                    maxImportance={maxImportance}
                  />
                ))
              ) : (
                <div className="text-xs text-dark-400 font-mono py-2 text-center">
                  No feature importance data available for this packet
                </div>
              )}
            </div>

            <div className="bg-dark-800 rounded border border-dark-500 p-3">
              <div className="text-xs text-dark-300 font-mono mb-2">Packet Info</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs font-mono">
                <div className="text-dark-400">Source:</div>
                <div className="text-dark-50">{packet.source || 'N/A'}</div>
                <div className="text-dark-400">Destination:</div>
                <div className="text-dark-50">{packet.destination || 'N/A'}</div>

                <div className="text-dark-400">Actual:</div>
                <div className={packet.is_actual_attack ? 'text-attack' : 'text-benign'}>
                  {packet.true_label || 'N/A'}
                </div>
                <div className="text-dark-400">Prediction:</div>
                <div className={packet.is_attack_predicted ? 'text-attack' : 'text-benign'}>
                  {packet.prediction || 'Unknown'}
                </div>
                <div className="text-dark-400">Confidence:</div>
                <div className={packet.confidence > 0.7 ? 'text-attack' : 'text-dark-50'}>
                  {(packet.confidence * 100).toFixed(1)}%
                </div>
              </div>
            </div>

            <div className="bg-dark-800 rounded border border-dark-500 p-3">
              <div className="text-xs text-dark-300 font-mono mb-2">Model Decision</div>
              <div className="text-xs font-mono text-dark-400 leading-relaxed">
                {packet.is_attack_predicted
                  ? `This packet was classified as an attack with ${(packet.confidence * 100).toFixed(0)}% confidence. The key indicators were the high SYN flag count and abnormal flow byte rate, which are characteristic of a ${packet.prediction || 'DDoS'} attack.`
                  : `This packet was classified as benign with ${(packet.confidence * 100).toFixed(0)}% confidence. The traffic characteristics match normal network behavior patterns.`
                }
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
