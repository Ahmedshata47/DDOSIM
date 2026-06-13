import React, { useState, useCallback, useRef, useEffect } from 'react'
import NetworkCanvas from './components/NetworkCanvas'
import ControlPanel from './components/ControlPanel'
import MLMonitor from './components/MLMonitor'
import PacketLog from './components/PacketLog'
import PacketDetail from './components/PacketDetail'

export default function App() {
  const [simState, setSimState] = useState('idle')
  const [packets, setPackets] = useState([])
  const [stats, setStats] = useState({
    total_packets: 0, attack_packets: 0, benign_packets: 0, attack_rate: 0, avg_confidence: 0,
  })
  const correctRef = useRef(0)
  const totalRef = useRef(0)
  const trafficRef = useRef([])
  const [networkData, setNetworkData] = useState({ attackers: [], server: null, router: null })
  const [selectedPacket, setSelectedPacket] = useState(null)
  const [alert, setAlert] = useState(null)
  const [connectionError, setConnectionError] = useState(null)
  const [dataStatus, setDataStatus] = useState(null)
  const [replayProgress, setReplayProgress] = useState(null)
  const [config, setConfig] = useState({
    attack_types: ['BENIGN', 'DrDoS_DNS', 'DrDoS_LDAP', 'DrDoS_MSSQL', 'DrDoS_NTP',
      'DrDoS_NetBIOS', 'DrDoS_SNMP', 'DrDoS_SSDP', 'DrDoS_UDP', 'Syn', 'TFTP', 'UDP-lag', 'WebDDoS'],
    packet_rate: 100,
    mitigation: false,
  })

  const wsRef = useRef(null)

  useEffect(() => {
    fetch('/api/data_status')
      .then(r => r.json())
      .then(d => setDataStatus(d))
      .catch(() => setDataStatus({ ready: false, real_model_ready: false }))
  }, [])

  const connectWebSocket = useCallback(() => {
    if (wsRef.current) wsRef.current.close()

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws/replay`)

    socket.onopen = () => {
      setConnectionError(null)
      socket.send(JSON.stringify(config))
    }

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data)

      switch (data.type) {
        case 'simulation_started':
          setNetworkData({
            attackers: [],
            server: data.server,
            router: data.router,
          })
          if (data.total_rows) {
            setReplayProgress({ total: data.total_rows, current: 0 })
          }
          setSimState('running')
          break

        case 'packet':
          if (!data.dropped) {
            totalRef.current += 1
            if (data.prediction === data.true_label) correctRef.current += 1
          }
          trafficRef.current.push({
            time: parseInt(data.packet_id?.split('_')[1]) || trafficRef.current.length + 1,
            attack: data.is_attack_predicted ? 1 : 0,
            confidence: data.confidence,
          })
          if (trafficRef.current.length > 2000) trafficRef.current = trafficRef.current.slice(-2000)
          setNetworkData(prev => {
            const existing = new Set(prev.attackers.map(a => a.id))
            if (data.source_id && !existing.has(data.source_id)) {
              const node = { id: data.source_id, ip: data.source }
              return { ...prev, attackers: [...prev.attackers, node] }
            }
            return prev
          })
          setPackets(prev => {
            const updated = [data, ...prev].slice(0, 500)
            return updated
          })
          setReplayProgress(prev => prev ? { ...prev, current: prev.current + 1 } : null)
          break

        case 'stats':
          setStats({
            ...data.stats,
            accuracy: totalRef.current > 0
              ? Math.round((correctRef.current / totalRef.current) * 1000) / 10
              : 0,
          })
          break

        case 'alert':
          setAlert(data)
          setTimeout(() => setAlert(null), 5000)
          break

        case 'error':
          console.error('Backend error:', data.message)
          setAlert({ message: `Error: ${data.message}`, type: 'error' })
          setTimeout(() => setAlert(null), 8000)
          break
      }
    }

    socket.onclose = (event) => {
      if (event.code !== 1000 && event.code !== 1005) {
        setConnectionError(`Connection lost (code: ${event.code})`)
      }
      setSimState('idle')
    }

    socket.onerror = () => {
      setConnectionError('Failed to connect to backend')
    }

    wsRef.current = socket
  }, [config])

  const startSimulation = useCallback(() => {
    setPackets([])
    correctRef.current = 0
    totalRef.current = 0
    trafficRef.current = []
    setStats({ total_packets: 0, attack_packets: 0, benign_packets: 0, attack_rate: 0, avg_confidence: 0 })
    setAlert(null)
    setConnectionError(null)
    setReplayProgress(null)
    connectWebSocket()
  }, [connectWebSocket])

  const pauseSimulation = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      setSimState(prev => {
        const isCurrentlyPaused = prev === 'paused'
        wsRef.current.send(JSON.stringify({ type: isCurrentlyPaused ? 'resume' : 'pause' }))
        return isCurrentlyPaused ? 'running' : 'paused'
      })
    }
  }, [])

  const stopSimulation = useCallback(() => {
    if (wsRef.current) {
      try { wsRef.current.send(JSON.stringify({ type: 'stop' })) } catch (e) {}
      wsRef.current.close()
    }
    setSimState('idle')
    setNetworkData({ attackers: [], server: null, router: null })
    setReplayProgress(null)
  }, [])

  const recentPackets = packets.slice(0, 50)
  const trafficHistory = trafficRef.current.slice(-200)

  const attackTypeCounts = packets.reduce((acc, p) => {
    const label = p.prediction || 'unknown'
    acc[label] = (acc[label] || 0) + 1
    return acc
  }, {})

  return (
    <div className="h-screen w-screen flex flex-col bg-dark-800 overflow-hidden">
      <header className="h-11 bg-dark-700 border-b border-dark-500 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-lg">🛡️</span>
          <h1 className="text-sm font-bold text-dark-50 font-mono tracking-wide">DDoSim</h1>
          <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded font-mono">REAL DATA</span>
        </div>
        <div className="flex items-center gap-3">
          {connectionError && (
            <div className="text-xs text-attack font-mono bg-attack/10 px-3 py-1 rounded">⚠ {connectionError}</div>
          )}
          {alert && (
            <div className="text-xs text-attack font-mono bg-attack/10 px-3 py-1 rounded alert-flash">{alert.message}</div>
          )}
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${
              simState === 'running' ? 'bg-benign animate-pulse' :
              simState === 'paused' ? 'bg-yellow-400' : 'bg-dark-400'
            }`} />
            <span className="text-xs text-dark-300 font-mono">
              {simState === 'running' ? 'RUNNING' : simState === 'paused' ? 'PAUSED' : 'IDLE'}
            </span>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <ControlPanel
          config={config}
          setConfig={setConfig}
          simState={simState}
          onStart={startSimulation}
          onPause={pauseSimulation}
          onStop={stopSimulation}
          stats={stats}
          dataStatus={dataStatus}
          onConfigChange={setConfig}
        />

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 relative">
              <NetworkCanvas
                networkData={networkData}
                packets={recentPackets}
                simState={simState}
              />
            </div>
            <MLMonitor
              stats={stats}
              trafficHistory={trafficHistory}
              attackTypeCounts={attackTypeCounts}
              recentPacket={recentPackets[0]}
              isReplay={true}
            />
          </div>

          <PacketLog
            packets={recentPackets}
            onSelectPacket={setSelectedPacket}
          />
        </div>
      </div>

      {selectedPacket && (
        <PacketDetail
          packet={selectedPacket}
          onClose={() => setSelectedPacket(null)}
        />
      )}
    </div>
  )
}