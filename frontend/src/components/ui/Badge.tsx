import clsx from 'clsx'
import type { ValueCategory, BetStatus } from '../../types'

interface CategoryBadgeProps {
  category: ValueCategory
  className?: string
}

export function CategoryBadge({ category, className }: CategoryBadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide',
        {
          'bg-red-900/60 text-red-300 border border-red-700': category === 'HIGH',
          'bg-amber-900/60 text-amber-300 border border-amber-700': category === 'MEDIUM',
          'bg-gray-700 text-gray-300 border border-gray-600': category === 'LOW',
        },
        className,
      )}
    >
      {category}
    </span>
  )
}

interface StatusBadgeProps {
  status: BetStatus
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide',
        {
          'bg-blue-900/60 text-blue-300 border border-blue-700': status === 'pending',
          'bg-green-900/60 text-green-300 border border-green-700': status === 'won',
          'bg-red-900/60 text-red-300 border border-red-700': status === 'lost',
          'bg-gray-700 text-gray-400 border border-gray-600': status === 'void',
        },
        className,
      )}
    >
      {status}
    </span>
  )
}
