import { useEffect, useRef } from 'react'
import { useValueBetsStore } from '../store/valueBetsStore'
import type { ValueBetFilters } from '../types'

export function useValueBets(filters?: ValueBetFilters) {
  const { valueBets, filteredBets, isLoading, error, fetchValueBets, total, currentPage, totalPages } =
    useValueBetsStore()

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const filtersRef = useRef(filters)
  filtersRef.current = filters

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    debounceRef.current = setTimeout(() => {
      fetchValueBets(filtersRef.current)
    }, 400)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters)])

  return { valueBets, filteredBets, isLoading, error, total, currentPage, totalPages, refetch: fetchValueBets }
}
