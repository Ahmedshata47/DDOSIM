import { useState, useEffect, useRef, useCallback } from 'react'

export default function useWebSocket(url) {
  const [isConnected, setIsConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState(null)
  const wsRef = useRef(null)
  const listenersRef = useRef(new Map())

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return
    const ws = new WebSocket(url)
    ws.onopen = () => setIsConnected(true)
    ws.onclose = () => setIsConnected(false)
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data)
      setLastMessage(data)
      const handlers = listenersRef.current.get(data.type) || []
      handlers.forEach(fn => fn(data))
    }
    wsRef.current = ws
  }, [url])

  const disconnect = useCallback(() => {
    wsRef.current?.close()
  }, [])

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }, [])

  const addListener = useCallback((type, handler) => {
    if (!listenersRef.current.has(type)) {
      listenersRef.current.set(type, [])
    }
    listenersRef.current.get(type).push(handler)
    return () => {
      const handlers = listenersRef.current.get(type) || []
      listenersRef.current.set(type, handlers.filter(h => h !== handler))
    }
  }, [])

  useEffect(() => {
    return () => wsRef.current?.close()
  }, [])

  return { isConnected, lastMessage, connect, disconnect, send, addListener }
}
