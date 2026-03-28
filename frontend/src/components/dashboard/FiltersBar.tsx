import { useState } from 'react'
import { Input, Select } from '../ui/Input'
import { Button } from '../ui/Button'
import type { ValueBetFilters, BetStatus, ValueCategory } from '../../types'

interface FiltersBarProps {
  filters: ValueBetFilters
  onApply: (filters: ValueBetFilters) => void
  onReset: () => void
}

export function FiltersBar({ filters, onApply, onReset }: FiltersBarProps) {
  const [local, setLocal] = useState<ValueBetFilters>(filters)

  const update = (key: keyof ValueBetFilters, value: string | number | undefined) => {
    setLocal((prev) => ({ ...prev, [key]: value }))
  }

  const handleApply = () => onApply(local)
  const handleReset = () => {
    const reset: ValueBetFilters = { status: 'all', category: 'all', page: 1, limit: 20 }
    setLocal(reset)
    onReset()
  }

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Input
          label="League"
          placeholder="All leagues"
          value={local.league ?? ''}
          onChange={(e) => update('league', e.target.value || undefined)}
        />
        <Input
          label="Min Odds"
          type="number"
          step="0.01"
          min="1"
          placeholder="1.00"
          value={local.minOdds ?? ''}
          onChange={(e) => update('minOdds', e.target.value ? parseFloat(e.target.value) : undefined)}
        />
        <Input
          label="Min Value %"
          type="number"
          step="1"
          min="0"
          placeholder="0"
          value={local.minValue !== undefined ? local.minValue * 100 : ''}
          onChange={(e) =>
            update('minValue', e.target.value ? parseFloat(e.target.value) / 100 : undefined)
          }
        />
        <Select
          label="Status"
          value={local.status ?? 'all'}
          onChange={(e) => update('status', e.target.value as BetStatus | 'all')}
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="won">Won</option>
          <option value="lost">Lost</option>
          <option value="void">Void</option>
        </Select>
        <Select
          label="Category"
          value={local.category ?? 'all'}
          onChange={(e) => update('category', e.target.value as ValueCategory | 'all')}
        >
          <option value="all">All Categories</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </Select>
        <div className="flex flex-col gap-1">
          <Input
            label="From"
            type="date"
            value={local.dateFrom ?? ''}
            onChange={(e) => update('dateFrom', e.target.value || undefined)}
          />
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-700">
        <Input
          label="To"
          type="date"
          value={local.dateTo ?? ''}
          onChange={(e) => update('dateTo', e.target.value || undefined)}
          className="max-w-[160px]"
        />
        <div className="flex gap-2 ml-auto mt-5">
          <Button variant="secondary" size="sm" onClick={handleReset}>
            Reset
          </Button>
          <Button variant="primary" size="sm" onClick={handleApply}>
            Apply Filters
          </Button>
        </div>
      </div>
    </div>
  )
}
