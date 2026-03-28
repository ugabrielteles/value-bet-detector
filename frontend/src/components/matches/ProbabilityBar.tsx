import clsx from 'clsx'

interface ProbabilityBarProps {
  label: string
  probability: number
  className?: string
}

export function ProbabilityBar({ label, probability, className }: ProbabilityBarProps) {
  const pct = Math.round(probability * 100)

  const barColor =
    pct >= 60
      ? 'bg-green-500'
      : pct >= 40
        ? 'bg-yellow-500'
        : 'bg-red-500'

  return (
    <div className={clsx('flex flex-col gap-1', className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-300 font-medium">{label}</span>
        <span className="text-white font-semibold">{pct}%</span>
      </div>
      <div className="h-2.5 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all duration-500', barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
