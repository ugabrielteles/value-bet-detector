import { useEffect, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { useValueBetsStore } from '../store/valueBetsStore'
import type { WebSocketEvent, ValueBet } from '../types'

const WS_URL = import.meta.env.VITE_WS_URL ?? 'http://localhost:3000'

let socket: Socket | null = null

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false)
  const addValueBet = useValueBetsStore((s) => s.addValueBet)

  useEffect(() => {
    const token = localStorage.getItem('accessToken')
    socket = io(WS_URL, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    })

    socket.on('connect', () => setIsConnected(true))
    socket.on('disconnect', () => setIsConnected(false))

    socket.on('value_bet_detected', (event: WebSocketEvent<ValueBet>) => {
      addValueBet(event.payload)
    })

    socket.on('odds_updated', (_event: WebSocketEvent<unknown>) => {
      // Odds updates are reflected in detail views
    })

    socket.on('steam_alert', (_event: WebSocketEvent<unknown>) => {
      // Steam alerts handled in alerts page
    })

    return () => {
      socket?.disconnect()
      socket = null
    }
  }, [addValueBet])

  return { isConnected }
}
