import { useMemo, useState } from 'react'
import axios from 'axios'
import { Card, CardBody, CardHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { predictionsApi } from '../services/api'
import { useAuthStore } from '../store/authStore'
import type { RecalculatePredictionsResult } from '../types'

type MatchStatus = 'scheduled' | 'live' | 'finished' | 'cancelled'

const availableStatuses: MatchStatus[] = ['scheduled', 'live', 'finished', 'cancelled']

function hasAdminRole(user: { role?: string; roles?: string[] } | null): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  return Array.isArray(user.roles) && user.roles.includes('admin')
}

export default function AdminPredictions() {
  const user = useAuthStore((s) => s.user)
  const [statuses, setStatuses] = useState<MatchStatus[]>(['scheduled', 'live'])
  const [limit, setLimit] = useState('1000')
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<RecalculatePredictionsResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isAdmin = useMemo(
    () => hasAdminRole((user as { role?: string; roles?: string[] } | null) ?? null),
    [user],
  )

  const toggleStatus = (status: MatchStatus) => {
    setStatuses((prev) => {
      if (prev.includes(status)) {
        return prev.filter((s) => s !== status)
      }
      return [...prev, status]
    })
  }

  const runRecalculation = async () => {
    setIsRunning(true)
    setError(null)
    setResult(null)
    try {
      const parsedLimit = Number(limit)
      const data = await predictionsApi.recalculateAll({
        statuses,
        limit: Number.isFinite(parsedLimit) ? parsedLimit : 1000,
      })
      setResult(data)
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 403) {
        setError('Acesso negado: apenas administradores podem recalcular previsoes.')
      } else {
        setError(err instanceof Error ? err.message : 'Falha ao recalcular previsoes.')
      }
    } finally {
      setIsRunning(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <Card>
          <CardBody className="py-8">
            <h1 className="text-xl font-bold text-white">Painel administrativo</h1>
            <p className="text-gray-300 mt-2">Esta area e exclusiva para administradores.</p>
          </CardBody>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Admin - Recalculo de previsoes</h1>
        <p className="text-sm text-gray-400 mt-1">
          Recalcula em lote as previsoes para remover valores antigos e aplicar os dados atuais de odds/estatisticas.
        </p>
      </div>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-white">Parametros</h2>
        </CardHeader>
        <CardBody className="space-y-4">
          <div>
            <p className="text-sm text-gray-300 mb-2">Status das partidas</p>
            <div className="flex flex-wrap gap-2">
              {availableStatuses.map((status) => {
                const selected = statuses.includes(status)
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => toggleStatus(status)}
                    className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                      selected
                        ? 'bg-blue-900/40 text-blue-200 border-blue-700'
                        : 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700'
                    }`}
                  >
                    {status}
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-gray-500 mt-2">Selecione ao menos um status para processar.</p>
          </div>

          <Input
            label="Limite maximo"
            type="number"
            min="1"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
          />

          <div className="pt-1">
            <Button
              variant="primary"
              onClick={runRecalculation}
              isLoading={isRunning}
              disabled={statuses.length === 0}
            >
              Recalcular previsoes
            </Button>
          </div>
        </CardBody>
      </Card>

      {error && (
        <Card>
          <CardBody className="py-4">
            <p className="text-red-300 text-sm">{error}</p>
          </CardBody>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-white">Resultado</h2>
          </CardHeader>
          <CardBody className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border border-gray-700 bg-gray-800/60 p-3">
                <p className="text-xs text-gray-400 uppercase">Total selecionadas</p>
                <p className="text-xl text-white font-bold">{result.total}</p>
              </div>
              <div className="rounded-lg border border-green-800 bg-green-900/20 p-3">
                <p className="text-xs text-green-300 uppercase">Recalculadas</p>
                <p className="text-xl text-green-200 font-bold">{result.recalculated}</p>
              </div>
              <div className="rounded-lg border border-red-800 bg-red-900/20 p-3">
                <p className="text-xs text-red-300 uppercase">Falhas</p>
                <p className="text-xl text-red-200 font-bold">{result.failed}</p>
              </div>
            </div>

            {result.failures.length > 0 && (
              <div>
                <p className="text-sm text-gray-300 mb-2">Erros</p>
                <div className="rounded-lg border border-gray-700 bg-gray-800/60 p-3 max-h-64 overflow-auto">
                  <ul className="space-y-1 text-xs text-red-300">
                    {result.failures.map((failure, index) => (
                      <li key={`${failure}-${index}`}>{failure}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  )
}
