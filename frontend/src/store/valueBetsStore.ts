import { create } from 'zustand'
import type { ValueBet, ValueBetFilters } from '../types'
import { matchesApi, valueBetsApi } from '../services/api'

interface ValueBetsState {
  valueBets: ValueBet[]
  filteredBets: ValueBet[]
  filters: ValueBetFilters
  isLoading: boolean
  error: string | null
  newAlertsCount: number
  total: number
  currentPage: number
  totalPages: number
  fetchValueBets: (filters?: ValueBetFilters) => Promise<void>
  addValueBet: (bet: ValueBet) => void
  setFilters: (filters: Partial<ValueBetFilters>) => void
  clearNewAlerts: () => void
  resetFilters: () => void
}

const defaultFilters: ValueBetFilters = {
  status: 'all',
  category: 'all',
  page: 1,
  limit: 20,
}

export const useValueBetsStore = create<ValueBetsState>((set, get) => ({
  valueBets: [],
  filteredBets: [],
  filters: defaultFilters,
  isLoading: false,
  error: null,
  newAlertsCount: 0,
  total: 0,
  currentPage: 1,
  totalPages: 1,

  fetchValueBets: async (filters?: ValueBetFilters) => {
    set({ isLoading: true, error: null })
    try {
      const activeFilters = filters ?? get().filters
      const cleanFilters: ValueBetFilters = {}
      if (activeFilters.league) cleanFilters.league = activeFilters.league
      if (activeFilters.minOdds !== undefined) cleanFilters.minOdds = activeFilters.minOdds
      if (activeFilters.minValue !== undefined) cleanFilters.minValue = activeFilters.minValue
      if (activeFilters.status && activeFilters.status !== 'all') cleanFilters.status = activeFilters.status
      if (activeFilters.category && activeFilters.category !== 'all') cleanFilters.category = activeFilters.category
      if (activeFilters.dateFrom) cleanFilters.dateFrom = activeFilters.dateFrom
      if (activeFilters.dateTo) cleanFilters.dateTo = activeFilters.dateTo
      cleanFilters.page = activeFilters.page ?? 1
      cleanFilters.limit = activeFilters.limit ?? 20

      const response = await valueBetsApi.getValueBets(cleanFilters)
      const uniqueMatchIds = [...new Set(response.data.map((bet) => bet.matchId))]
      const matchesResult = await Promise.allSettled(uniqueMatchIds.map((id) => matchesApi.getMatch(id)))

      const matchMap = new Map<string, Awaited<ReturnType<typeof matchesApi.getMatch>>>()
      matchesResult.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          matchMap.set(uniqueMatchIds[index], result.value)
        }
      })

      const dataWithMatch = response.data.map((bet) => ({
        ...bet,
        match: bet.match ?? matchMap.get(bet.matchId),
      }))

      set({
        valueBets: dataWithMatch,
        filteredBets: dataWithMatch,
        total: response.total,
        currentPage: response.page,
        totalPages: response.totalPages,
        isLoading: false,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch value bets'
      set({ error: message, isLoading: false })
    }
  },

  addValueBet: (bet: ValueBet) => {
    set((state) => ({
      valueBets: [bet, ...state.valueBets],
      filteredBets: [bet, ...state.filteredBets],
      newAlertsCount: state.newAlertsCount + 1,
    }))
  },

  setFilters: (filters: Partial<ValueBetFilters>) => {
    set((state) => ({
      filters: { ...state.filters, ...filters, page: 1 },
    }))
  },

  clearNewAlerts: () => set({ newAlertsCount: 0 }),

  resetFilters: () => set({ filters: defaultFilters }),
}))
