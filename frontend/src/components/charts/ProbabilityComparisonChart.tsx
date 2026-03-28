import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from 'recharts'
import type { ModelPrediction } from '../../types'

interface ProbabilityComparisonChartProps {
  predictions: ModelPrediction[]
}

export function ProbabilityComparisonChart({ predictions }: ProbabilityComparisonChartProps) {
  const data = predictions.map((p) => ({
    outcome: p.outcome,
    'Model Probability': parseFloat((p.probability * 100).toFixed(1)),
    'Implied Probability': parseFloat(((1 / (p.probability + 0.02)) * 100 * 0.92).toFixed(1)),
  }))

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="outcome" tick={{ fill: '#9ca3af', fontSize: 12 }} />
        <YAxis unit="%" tick={{ fill: '#9ca3af', fontSize: 11 }} />
        <Tooltip
          formatter={(value: number) => [`${value}%`]}
          contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
          labelStyle={{ color: '#e5e7eb' }}
        />
        <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
        <Bar dataKey="Model Probability" fill="#3b82f6" radius={[4, 4, 0, 0]}>
          {data.map((_, index) => (
            <Cell key={index} fill="#3b82f6" />
          ))}
        </Bar>
        <Bar dataKey="Implied Probability" fill="#6b7280" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
