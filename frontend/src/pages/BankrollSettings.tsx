import { useEffect, useState } from 'react'
import { bankrollApi } from '../services/api'
import type { Bankroll, UpdateBankrollData, BettingStrategy } from '../types'
import { Card, CardHeader, CardBody } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input, Select } from '../components/ui/Input'
import { Spinner } from '../components/ui/Spinner'

export default function BankrollSettings() {
  const [bankroll, setBankroll] = useState<Bankroll | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Form state
  const [initialBankroll, setInitialBankroll] = useState(1000)
  const [currency, setCurrency] = useState('USD')
  const [strategy, setStrategy] = useState<BettingStrategy>('flat')
  const [minBetPct, setMinBetPct] = useState(1)
  const [maxBetPct, setMaxBetPct] = useState(5)
  const [useKelly, setUseKelly] = useState(false)
  const [kellyFraction, setKellyFraction] = useState(0.25)
  const [stopLossEnabled, setStopLossEnabled] = useState(false)
  const [stopLossPct, setStopLossPct] = useState(20)

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
      setSuccessMsg('Settings saved successfully!')
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
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
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Bankroll Settings</h1>
        <p className="text-gray-400 text-sm mt-1">Configure your betting bankroll and staking strategy</p>
      </div>

      {/* Status Cards */}
      {bankroll && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardBody className="py-3">
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Current</div>
              <div className="text-xl font-bold text-white">
                {bankroll.currency} {bankroll.currentBankroll.toFixed(2)}
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="py-3">
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Initial</div>
              <div className="text-xl font-bold text-white">
                {bankroll.currency} {bankroll.initialBankroll.toFixed(2)}
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="py-3">
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">P&L</div>
              <div className={`text-xl font-bold ${plColor}`}>
                {bankroll.profitLoss >= 0 ? '+' : ''}{bankroll.profitLoss.toFixed(2)}
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
            <div className="font-semibold text-red-300">Stop-Loss Triggered</div>
            <div className="text-sm text-red-400">
              Your bankroll has fallen below the stop-loss threshold. Betting is paused.
            </div>
          </div>
        </div>
      )}

      {/* Strategy */}
      <Card>
        <CardHeader><h2 className="font-semibold text-white">Staking Strategy</h2></CardHeader>
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
                {s === 'kelly' ? 'Kelly' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label={`Initial Bankroll (${currency})`}
              type="number"
              min="10"
              step="10"
              value={initialBankroll}
              onChange={(e) => setInitialBankroll(parseFloat(e.target.value) || 0)}
            />
            <Select
              label="Currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {['USD', 'EUR', 'GBP', 'BTC', 'ETH'].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </div>

          {/* Min/Max sliders */}
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <label className="text-gray-300">Min Bet %</label>
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
                <label className="text-gray-300">Max Bet %</label>
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
            <label htmlFor="useKelly" className="text-sm text-gray-300">Use Kelly Criterion</label>
          </div>

          {useKelly && (
            <div>
              <div className="flex justify-between text-sm mb-1">
                <label className="text-gray-300">Kelly Fraction</label>
                <span className="text-white font-medium">
                  {kellyFraction === 0.5 ? 'Half-Kelly' : kellyFraction === 0.25 ? 'Quarter-Kelly' : `${(kellyFraction * 100).toFixed(0)}%`}
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
                <span>Quarter-Kelly</span>
                <span>Half-Kelly</span>
                <span>Full</span>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Stop-Loss */}
      <Card>
        <CardHeader><h2 className="font-semibold text-white">Stop-Loss Protection</h2></CardHeader>
        <CardBody className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="stopLoss"
              checked={stopLossEnabled}
              onChange={(e) => setStopLossEnabled(e.target.checked)}
              className="w-4 h-4 accent-blue-500"
            />
            <label htmlFor="stopLoss" className="text-sm text-gray-300">Enable Stop-Loss</label>
          </div>

          {stopLossEnabled && (
            <div>
              <div className="flex justify-between text-sm mb-1">
                <label className="text-gray-300">Stop-Loss Threshold</label>
                <span className="text-white font-medium">{stopLossPct}%</span>
              </div>
              <input
                type="range" min="5" max="50" step="5"
                value={stopLossPct}
                onChange={(e) => setStopLossPct(parseInt(e.target.value))}
                className="w-full accent-red-500"
              />
              <p className="text-xs text-gray-500 mt-2">
                Betting will pause if your bankroll drops by {stopLossPct}% from its initial value
                ({currency} {((1 - stopLossPct / 100) * initialBankroll).toFixed(2)}).
              </p>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Strategy Guide */}
      <Card>
        <CardHeader><h2 className="font-semibold text-white">Strategy Guide</h2></CardHeader>
        <CardBody className="text-sm text-gray-400 space-y-2">
          <p><span className="text-white font-medium">Flat Staking:</span> Bet the same fixed amount each time. Simple and predictable.</p>
          <p><span className="text-white font-medium">Kelly Criterion:</span> Mathematically optimal bet sizing based on edge. Use a fraction (0.25–0.5) for safety.</p>
          <p><span className="text-white font-medium">Percentage:</span> Bet a fixed % of your current bankroll each time. Adapts to wins/losses.</p>
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
        Save Settings
      </Button>
    </div>
  )
}
