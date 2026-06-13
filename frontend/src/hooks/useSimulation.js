import { useState, useCallback, useRef, useEffect } from 'react'

export default function useSimulation(config) {
  const [simState, setSimState] = useState('idle')
  const [packets, setPackets] = useState([])
  const [stats, setStats] = useState({ total_packets: 0, attack_packets: 0, benign_packets: 0, attack_rate: 0, avg_confidence: 0 })
  const [alert, setAlert] = useState(null)
  const wsRef = useRef(null)

  const connect = useCallback(() => {
    if (wsRef.current) wsRef.current.close()

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws/simulate`)

    socket.onopen = () => {
      socket.send(JSON.stringify(config))
    }

    socket.onmessage = (e) => {
      const data = JSON.parse(e.data)
      switch (data.type) {
        case 'simulation_started':
          setSimState('running')
          break
        case 'packet':
          setPackets(prev => [data, ...prev].slice(0, 500))
          break
        case 'stats':
          setStats(data.stats)
          break
        case 'alert':
          setAlert(data)
          setTimeout(() => setAlert(null), 5000)
          break
      }
    }

    socket.onclose = () => setSimState('idle')
    wsRef.current = socket
  }, [config])

  const start = useCallback(() => {
    setPackets([])
    setStats({ total_packets: 0, attack_packets: 0, benign_packets: 0, attack_rate: 0, avg_confidence: 0 })
    setAlert(null)
    connect()
  }, [connect])

  const pause = useCallback(() => {
    setSimState(prev => prev === 'paused' ? 'running' : 'paused')
  }, [])

  const stop = useCallback(() => {
    wsRef.current?.close()
    setSimState('idle')
  }, [])

  useEffect(() => {
    return () => wsRef.current?.close()
  }, [])

  return { simState, packets, stats, alert, start, pause, stop }
}
