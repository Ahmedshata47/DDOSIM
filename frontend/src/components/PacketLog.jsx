import React, { useRef, useEffect } from 'react'

export default function PacketLog({ packets, onSelectPacket }) {
  const listRef = useRef(null)

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = 0
    }
  }, [packets])

  return (
    <div className="h-44 bg-dark-700 border-t border-dark-500 flex flex-col shrink-0">
      <div className="h-8 px-3 flex items-center border-b border-dark-500 shrink-0">
        <h3 className="text-xs font-bold text-dark-300 font-mono">Packet Log</h3>
        <span className="text-xs text-dark-400 font-mono ml-2">({packets.length} packets)</span>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto">
        <table className="w-full text-xs font-mono">
          <thead className="sticky top-0 bg-dark-600">
            <tr className="text-dark-400 border-b border-dark-500">
              <th className="text-left py-1.5 px-2 font-medium w-20">Time</th>
              <th className="text-left py-1.5 px-2 font-medium">Source</th>
              <th className="text-left py-1.5 px-2 font-medium">Actual</th>
              <th className="text-left py-1.5 px-2 font-medium">Prediction</th>
              <th className="text-center py-1.5 px-2 font-medium w-12">Check Prediction</th>
              <th className="text-right py-1.5 px-2 font-medium w-16">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {packets.length === 0 ? (
              <tr>
                <td colSpan="6" className="text-center py-8 text-dark-400">
                  No packets yet. Start a simulation to see traffic.
                </td>
              </tr>
            ) : (
              packets.map((pkt, i) => (
                <tr
                  key={pkt.packet_id || i}
                  onClick={() => onSelectPacket(pkt)}
                  className={`cursor-pointer border-b border-dark-600 transition-colors hover:bg-dark-600 ${
                    pkt.is_attack_predicted ? 'text-attack' : 'text-dark-50'
                  }`}
                >
                  <td className="py-1 px-2 text-dark-400 whitespace-nowrap">
                    T+{((pkt.timestamp || 0) % 100).toFixed(1)}s
                  </td>
                  <td className="py-1 px-2 whitespace-nowrap">
                    <span className="text-dark-400">{pkt.source || '???'}</span>
                  </td>
                  <td className="py-1 px-2 whitespace-nowrap">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${
                      pkt.is_actual_attack
                        ? 'bg-attack/20 text-attack'
                        : 'bg-benign/20 text-benign'
                    }`}>
                      {pkt.true_label || '???'}
                    </span>
                  </td>
                  <td className="py-1 px-2 whitespace-nowrap">
                    {pkt.dropped ? (
                      <span className="px-1.5 py-0.5 rounded text-xs bg-dark-500 text-dark-200">DROPPED</span>
                    ) : (
                      <span className={`px-1.5 py-0.5 rounded text-xs ${
                        pkt.is_attack_predicted
                          ? 'bg-attack/20 text-attack'
                          : 'bg-benign/20 text-benign'
                      }`}>
                        {pkt.prediction || (pkt.is_attack_predicted ? 'ATTACK' : 'BENIGN')}
                      </span>
                    )}
                  </td>
                  <td className="py-1 px-2 text-center whitespace-nowrap text-sm">
                    {pkt.dropped ? '' : (
                      pkt.prediction === pkt.true_label
                        ? <span className="text-benign">&#10003;</span>
                        : <span className="text-attack">&#10007;</span>
                    )}
                  </td>
                  <td className="py-1 px-2 text-right whitespace-nowrap">
                    {pkt.dropped ? '' : `${(pkt.confidence * 100).toFixed(0)}%`}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
