import { useEffect, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { useValueBetsStore } from '../store/valueBetsStore'
import { ValueCategory } from '../types'
import type { WebSocketEvent, ValueBet } from '../types'

const WS_URL = import.meta.env.VITE_WS_URL ?? 'http://localhost:3000'

let socket: Socket | null = null

type IncomingValueBet = Partial<ValueBet> & {
  id: string
  matchId: string
  market: string
  outcome: string
  bookmaker: string
  bookmakerOdds: number
  modelProbability: number
  impliedProbability: number
  value?: number
  valueScore?: number
  classification?: ValueCategory
  valueCategory?: ValueCategory
  status: ValueBet['status']
  detectedAt: string
}

function normalizeIncomingValueBet(raw: IncomingValueBet): ValueBet {
  const valueScore = raw.valueScore ?? raw.value ?? 0
  const valueCategory = raw.valueCategory ?? raw.classification ?? ValueCategory.LOW

  return {
    ...raw,
    market: raw.market as ValueBet['market'],
    valueScore,
    valueCategory,
  }
}

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

    const onValueBet = (payload: IncomingValueBet | WebSocketEvent<IncomingValueBet>) => {
      const bet = 'payload' in payload ? payload.payload : payload
      addValueBet(normalizeIncomingValueBet(bet))
    }

    socket.on('value_bet_detected', onValueBet)
    socket.on('valueBetDetected', onValueBet)

    socket.on('odds_updated', (_event: WebSocketEvent<unknown>) => {
      // Odds updates are reflected in detail views
    })
    socket.on('oddsUpdated', (_event: unknown) => {
      // Keep compatibility with backend's current event name
    })

    socket.on('steam_alert', (_event: WebSocketEvent<unknown>) => {
      // Steam alerts handled in alerts page
    })
    socket.on('steamAlert', (_event: unknown) => {
      // Keep compatibility with backend's current event name
    })

    return () => {
      socket?.off('value_bet_detected', onValueBet)
      socket?.off('valueBetDetected', onValueBet)
      socket?.disconnect()
      socket = null
    }
  }, [addValueBet])

  return { isConnected }
}
