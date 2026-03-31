import { useEffect, useState } from 'react'
import { bankrollApi } from '../services/api'
import type { Bankroll, UpdateBankrollData, BettingStrategy } from '../types'
import { Card, CardHeader, CardBody } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input, Select } from '../components/ui/Input'
import { Spinner } from '../components/ui/Spinner'
import { useI18n } from '../hooks/useI18n'

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: currency || 'BRL',
    maximumFractionDigits: 2,
  }).format(value)
}

export default function BankrollSettings() {
  const [bankroll, setBankroll] = useState<Bankroll | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Form state
  const [initialBankroll, setInitialBankroll] = useState(1000)
  const [currency, setCurrency] = useState('BRL')
  const [strategy, setStrategy] = useState<BettingStrategy>('flat')
  const [minBetPct, setMinBetPct] = useState(1)
  const [maxBetPct, setMaxBetPct] = useState(5)
  const [useKelly, setUseKelly] = useState(false)
  const [kellyFraction, setKellyFraction] = useState(0.25)
  const [stopLossEnabled, setStopLossEnabled] = useState(false)
  const [stopLossPct, setStopLossPct] = useState(20)
  const { dict } = useI18n()

  useEffect(() => {
    bankrollApi
      .getBankroll()
      .then((b) => {
        setBankroll(b)
        setInitialBankroll(b.initialBankroll)
        setCurrency(b.currency)
        setStrategy(b.strategy)
        setMinBetPct(b.minBetPercentage)
        setMaxBetPct(b.maxBetPercentage)
        setUseKelly(b.useKellyCriterion)
        setKellyFraction(b.kellyFraction)
        setStopLossEnabled(b.stopLossEnabled)
        setStopLossPct(b.stopLossPercentage)
      })
      .catch(() => {
        // Bankroll not created yet — use defaults
      })
      .finally(() => setIsLoading(false))
  }, [])

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    setSuccessMsg(null)
    const data: UpdateBankrollData = {
      initialBankroll,
      currentBankroll: initialBankroll,
      minBetPercentage: minBetPct,
      maxBetPercentage: maxBetPct,
      strategy,
      useKellyCriterion: useKelly,
      kellyFraction,
      stopLossEnabled,
      stopLossPercentage: stopLossPct,
      currency,
    }
    try {
      const updated = await bankrollApi.updateBankroll(data)
      setBankroll(updated)
      setSuccessMsg(dict.bankroll.saveSuccess)
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : dict.bankroll.saveFailed)
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Spinner size="lg" />
      </div>
    )
  }

  const plColor = bankroll && bankroll.profitLoss >= 0 ? 'text-green-400' : 'text-red-400'
  const roiColor = bankroll && bankroll.roi >= 0 ? 'text-green-400' : 'text-red-400'

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">{dict.bankroll.title}</h1>
        <p className="text-gray-400 text-sm mt-1">{dict.bankroll.subtitle}</p>
      </div>

      {/* Status Cards */}
      {bankroll && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardBody className="py-3">
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">{dict.bankroll.current}</div>
              <div className="text-xl font-bold text-white">
                {formatCurrency(bankroll.currentBankroll, bankroll.currency)}
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="py-3">
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">{dict.bankroll.initial}</div>
              <div className="text-xl font-bold text-white">
                {formatCurrency(bankroll.initialBankroll, bankroll.currency)}
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="py-3">
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">P&L</div>
              <div className={`text-xl font-bold ${plColor}`}>
                {bankroll.profitLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(bankroll.profitLoss), bankroll.currency)}
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="py-3">
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">ROI</div>
              <div className={`text-xl font-bold ${roiColor}`}>
                {bankroll.roi >= 0 ? '+' : ''}{(bankroll.roi * 100).toFixed(1)}%
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Stop-loss alert */}
      {bankroll?.isStopped && (
        <div className="bg-red-900/40 border border-red-700 rounded-xl p-4 flex items-center gap-3">
          <span className="text-2xl">⛔</span>
          <div>
            <div className="font-semibold text-red-300">{dict.bankroll.stopLossTriggered}</div>
            <div className="text-sm text-red-400">
              {dict.bankroll.stopLossTriggeredHint}
            </div>
          </div>
        </div>
      )}

      {/* Strategy */}
      <Card>
        <CardHeader><h2 className="font-semibold text-white">{dict.bankroll.stakingStrategy}</h2></CardHeader>
        <CardBody className="space-y-5">
          <div className="flex gap-2">
            {(['flat', 'kelly', 'percentage'] as BettingStrategy[]).map((s) => (
              <button
                key={s}
                onClick={() => setStrategy(s)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                  strategy === s
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {s === 'kelly' ? dict.bankroll.kelly : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label={`${dict.bankroll.initialBankrollWithCurrency} (${currency})`}
              type="number"
              min="10"
              step="10"
              value={initialBankroll}
              onChange={(e) => setInitialBankroll(parseFloat(e.target.value) || 0)}
            />
            <Select
              label={dict.bankroll.currency}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {['BRL', 'USD', 'EUR', 'GBP', 'BTC', 'ETH'].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </div>

          {/* Min/Max sliders */}
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <label className="text-gray-300">{dict.bankroll.minBetPct}</label>
                <span className="text-white font-medium">{minBetPct}%</span>
              </div>
              <input
                type="range" min="0.5" max="10" step="0.5"
                value={minBetPct}
                onChange={(e) => setMinBetPct(parseFloat(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <label className="text-gray-300">{dict.bankroll.maxBetPct}</label>
                <span className="text-white font-medium">{maxBetPct}%</span>
              </div>
              <input
                type="range" min="1" max="25" step="0.5"
                value={maxBetPct}
                onChange={(e) => setMaxBetPct(parseFloat(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>
          </div>

          {/* Kelly */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="useKelly"
              checked={useKelly}
              onChange={(e) => setUseKelly(e.target.checked)}
              className="w-4 h-4 accent-blue-500"
            />
            <label htmlFor="useKelly" className="text-sm text-gray-300">{dict.bankroll.useKelly}</label>
          </div>

          {useKelly && (
            <div>
              <div className="flex justify-between text-sm mb-1">
                <label className="text-gray-300">{dict.bankroll.kellyFraction}</label>
                <span className="text-white font-medium">
                  {kellyFraction === 0.5 ? dict.bankroll.halfKelly : kellyFraction === 0.25 ? dict.bankroll.quarterKelly : `${(kellyFraction * 100).toFixed(0)}%`}
                </span>
              </div>
              <input
                type="range" min="0.1" max="1" step="0.05"
                value={kellyFraction}
                onChange={(e) => setKellyFraction(parseFloat(e.target.value))}
                className="w-full accent-blue-500"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>10%</span>
                <span>{dict.bankroll.quarterKelly}</span>
                <span>{dict.bankroll.halfKelly}</span>
                <span>{dict.bankroll.full}</span>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Stop-Loss */}
      <Card>
        <CardHeader><h2 className="font-semibold text-white">{dict.bankroll.stopLossProtection}</h2></CardHeader>
        <CardBody className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="stopLoss"
              checked={stopLossEnabled}
              onChange={(e) => setStopLossEnabled(e.target.checked)}
              className="w-4 h-4 accent-blue-500"
            />
            <label htmlFor="stopLoss" className="text-sm text-gray-300">{dict.bankroll.enableStopLoss}</label>
          </div>

          {stopLossEnabled && (
            <div>
              <div className="flex justify-between text-sm mb-1">
                <label className="text-gray-300">{dict.bankroll.stopLossThreshold}</label>
                <span className="text-white font-medium">{stopLossPct}%</span>
              </div>
              <input
                type="range" min="5" max="50" step="5"
                value={stopLossPct}
                onChange={(e) => setStopLossPct(parseInt(e.target.value))}
                className="w-full accent-red-500"
              />
              <p className="text-xs text-gray-500 mt-2">
                {dict.bankroll.stopLossHint} {stopLossPct}% {dict.bankroll.fromInitialValue}
                ({formatCurrency((1 - stopLossPct / 100) * initialBankroll, currency)}).
              </p>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Strategy Guide */}
      <Card>
        <CardHeader><h2 className="font-semibold text-white">{dict.bankroll.strategyGuide}</h2></CardHeader>
        <CardBody className="text-sm text-gray-400 space-y-2">
          <p><span className="text-white font-medium">{dict.bankroll.flatStaking}:</span> {dict.bankroll.flatStakingHint}</p>
          <p><span className="text-white font-medium">{dict.bankroll.useKelly}:</span> {dict.bankroll.kellyHint}</p>
          <p><span className="text-white font-medium">{dict.simulator.percentage}:</span> {dict.bankroll.percentageHint}</p>
        </CardBody>
      </Card>

      {/* Feedback */}
      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm">{error}</div>
      )}
      {successMsg && (
        <div className="bg-green-900/30 border border-green-700 text-green-300 rounded-lg px-4 py-3 text-sm">{successMsg}</div>
      )}

      <Button variant="primary" size="lg" onClick={handleSave} isLoading={isSaving} className="w-full">
        {dict.bankroll.saveSettings}
      </Button>
    </div>
  )
}
