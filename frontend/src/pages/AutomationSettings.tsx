import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Card, CardBody, CardHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input, Select } from '../components/ui/Input'
import { Spinner } from '../components/ui/Spinner'
import {
  betAutomationApi,
  bookmakerCredentialsApi,
} from '../services/api'
import type {
  AutomationProviderStatus,
  AutomationRunResult,
  BookmakerCredentialsSafeView,
  BookmakerProvider,
} from '../types'

const PROVIDER_LABELS: Record<BookmakerProvider, string> = {
  betano: 'Betano',
  bet365: 'Bet365',
  betfair: 'Betfair',
  bwin: 'Bwin',
  unibet: 'Unibet',
  other: 'Other',
}

export default function AutomationSettings() {
  const [providersStatus, setProvidersStatus] = useState<AutomationProviderStatus[]>([])
  const [credentials, setCredentials] = useState<BookmakerCredentialsSafeView[]>([])
  const [selectedProvider, setSelectedProvider] = useState<BookmakerProvider>('betano')

  const [accountLabel, setAccountLabel] = useState('')
  const [loginUrl, setLoginUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [twoFactorSecret, setTwoFactorSecret] = useState('')

  const [eventUrl, setEventUrl] = useState('')
  const [selectionText, setSelectionText] = useState('')
  const [stake, setStake] = useState(10)
  const [dryRun, setDryRun] = useState(true)
  const [confirmRealBet, setConfirmRealBet] = useState(false)

  const [result, setResult] = useState<AutomationRunResult | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedCredential = useMemo(
    () => credentials.find((c) => c.provider === selectedProvider),
    [credentials, selectedProvider],
  )

  const selectedProviderStatus = useMemo(
    () => providersStatus.find((p) => p.provider === selectedProvider),
    [providersStatus, selectedProvider],
  )

  const loadData = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [statusRows, credentialRows] = await Promise.all([
        betAutomationApi.getProvidersStatus(),
        bookmakerCredentialsApi.list(),
      ])
      setProvidersStatus(statusRows)
      setCredentials(credentialRows)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar automacao')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  useEffect(() => {
    setAccountLabel(selectedCredential?.accountLabel ?? '')
    setLoginUrl(selectedCredential?.loginUrl ?? '')
    setUsername('')
    setPassword('')
    setTwoFactorSecret('')
  }, [selectedCredential])

  const handleSaveCredentials = async () => {
    setIsSaving(true)
    setError(null)
    try {
      await bookmakerCredentialsApi.upsert({
        provider: selectedProvider,
        accountLabel: accountLabel || undefined,
        loginUrl: loginUrl || undefined,
        username: username || undefined,
        password: password || undefined,
        twoFactorSecret: twoFactorSecret || undefined,
      })
      setPassword('')
      setTwoFactorSecret('')
      setUsername('')
      await loadData()
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(String(err.response?.data?.message ?? err.message))
      } else {
        setError(err instanceof Error ? err.message : 'Falha ao salvar credenciais')
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteCredential = async (id: string) => {
    setError(null)
    try {
      await bookmakerCredentialsApi.remove(id)
      await loadData()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao remover credencial')
    }
  }

  const handleRunAutomation = async () => {
    setIsRunning(true)
    setError(null)
    setResult(null)

    try {
      const runResult = await betAutomationApi.run({
        provider: selectedProvider,
        eventUrl,
        selectionText,
        stake,
        dryRun,
        confirmRealBet,
      })
      setResult(runResult)
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(String(err.response?.data?.message ?? err.message))
      } else {
        setError(err instanceof Error ? err.message : 'Falha ao executar automacao')
      }
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Automacao por casa</h1>
        <p className="text-gray-400 text-sm mt-1">
          Cadastre credenciais por casa de aposta e execute automacao por provedor.
        </p>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-500/40 text-red-300 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-white">Provedores</h3>
            </CardHeader>
            <CardBody>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {providersStatus.map((provider) => (
                  <button
                    key={provider.provider}
                    onClick={() => setSelectedProvider(provider.provider)}
                    className={`text-left rounded-lg border p-3 transition-colors ${
                      selectedProvider === provider.provider
                        ? 'border-blue-500 bg-blue-900/20'
                        : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-white">{PROVIDER_LABELS[provider.provider]}</span>
                      <span className={`text-xs px-2 py-1 rounded ${provider.automationAvailable ? 'bg-green-900/40 text-green-300' : 'bg-yellow-900/40 text-yellow-300'}`}>
                        {provider.automationAvailable ? 'Ativa' : 'Em breve'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-2">
                      Credenciais: {provider.isConfigured ? 'configuradas' : 'nao configuradas'}
                    </div>
                  </button>
                ))}
              </div>
            </CardBody>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <h3 className="font-semibold text-white">Credenciais - {PROVIDER_LABELS[selectedProvider]}</h3>
              </CardHeader>
              <CardBody className="space-y-3">
                <Input label="Nome da conta" value={accountLabel} onChange={(e) => setAccountLabel(e.target.value)} />
                <Input label="URL de login" value={loginUrl} onChange={(e) => setLoginUrl(e.target.value)} placeholder="https://..." />
                <Input label="Usuario" value={username} onChange={(e) => setUsername(e.target.value)} placeholder={selectedCredential?.hasUsername ? 'Preenchido (deixe em branco para manter)' : ''} />
                <Input label="Senha" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={selectedCredential?.hasPassword ? 'Preenchida (deixe em branco para manter)' : ''} />
                <Input label="Segredo 2FA (opcional)" type="password" value={twoFactorSecret} onChange={(e) => setTwoFactorSecret(e.target.value)} placeholder={selectedCredential?.hasTwoFactorSecret ? 'Configurado (deixe em branco para manter)' : ''} />
                <div className="flex justify-end">
                  <Button onClick={handleSaveCredentials} disabled={isSaving}>
                    {isSaving ? 'Salvando...' : 'Salvar credenciais'}
                  </Button>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <h3 className="font-semibold text-white">Executar automacao</h3>
              </CardHeader>
              <CardBody className="space-y-3">
                <Select label="Casa" value={selectedProvider} onChange={(e) => setSelectedProvider(e.target.value as BookmakerProvider)}>
                  {providersStatus.map((provider) => (
                    <option key={provider.provider} value={provider.provider}>
                      {PROVIDER_LABELS[provider.provider]}
                    </option>
                  ))}
                </Select>
                <Input label="URL do evento" value={eventUrl} onChange={(e) => setEventUrl(e.target.value)} placeholder="https://..." />
                <Input label="Texto da selecao" value={selectionText} onChange={(e) => setSelectionText(e.target.value)} placeholder="Ex.: Over 2.5" />
                <Input label="Stake" type="number" min="0.1" step="0.1" value={stake} onChange={(e) => setStake(Number(e.target.value) || 0)} />

                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
                  Dry-run (nao confirma aposta real)
                </label>

                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={confirmRealBet}
                    onChange={(e) => setConfirmRealBet(e.target.checked)}
                    disabled={dryRun}
                  />
                  Confirmar aposta real
                </label>

                <div className="flex justify-end">
                  <Button
                    onClick={handleRunAutomation}
                    disabled={isRunning || !selectedProviderStatus?.isConfigured || !eventUrl || !selectionText || stake <= 0}
                  >
                    {isRunning ? 'Executando...' : 'Executar automacao'}
                  </Button>
                </div>

                {!selectedProviderStatus?.isConfigured && (
                  <p className="text-xs text-yellow-300">
                    Cadastre credenciais desta casa antes de executar.
                  </p>
                )}
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <h3 className="font-semibold text-white">Credenciais cadastradas por casa</h3>
            </CardHeader>
            <CardBody>
              {credentials.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhuma credencial cadastrada ainda.</p>
              ) : (
                <div className="space-y-2">
                  {credentials.map((row) => (
                    <div key={row.id} className="flex items-center justify-between bg-gray-800 border border-gray-700 rounded-lg p-3">
                      <div>
                        <div className="text-sm text-white font-medium">
                          {PROVIDER_LABELS[row.provider]} {row.accountLabel ? `- ${row.accountLabel}` : ''}
                        </div>
                        <div className="text-xs text-gray-400">
                          login: {row.loginUrl || '-'} | user: {row.hasUsername ? 'sim' : 'nao'} | senha: {row.hasPassword ? 'sim' : 'nao'}
                        </div>
                      </div>
                      <Button variant="danger" size="sm" onClick={() => handleDeleteCredential(row.id)}>
                        Remover
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          {result && (
            <Card>
              <CardHeader>
                <h3 className="font-semibold text-white">Resultado da execucao</h3>
              </CardHeader>
              <CardBody>
                <div className="text-sm text-gray-200">Provider: {PROVIDER_LABELS[result.provider]}</div>
                <div className="text-sm text-gray-200">Sucesso: {result.ok ? 'sim' : 'nao'}</div>
                {result.reason && <div className="text-sm text-yellow-300 mt-1">{result.reason}</div>}
                {Array.isArray(result.steps) && result.steps.length > 0 && (
                  <ul className="mt-3 text-xs text-gray-300 space-y-1 list-disc list-inside">
                    {result.steps.map((step, index) => (
                      <li key={`${step}-${index}`}>{step}</li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
