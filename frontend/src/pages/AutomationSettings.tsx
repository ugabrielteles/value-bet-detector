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
  AutomationSessionStatus,
  BookmakerCredentialsSafeView,
  BookmakerProvider,
  CompleteManualAutomationSessionResult,
  StartManualAutomationSessionResult,
} from '../types'

const SESSION_STATUS_REFRESH_MS = 5000

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
  const [sessionStatus, setSessionStatus] = useState<AutomationSessionStatus | null>(null)
  const [manualSessionResult, setManualSessionResult] = useState<StartManualAutomationSessionResult | CompleteManualAutomationSessionResult | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [isSessionLoading, setIsSessionLoading] = useState(false)
  const [isStartingSession, setIsStartingSession] = useState(false)
  const [isCompletingSession, setIsCompletingSession] = useState(false)
  const [isClearingSession, setIsClearingSession] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedCredential = useMemo(
    () => credentials.find((c) => c.provider === selectedProvider),
    [credentials, selectedProvider],
  )

  const selectedProviderStatus = useMemo(
    () => providersStatus.find((p) => p.provider === selectedProvider),
    [providersStatus, selectedProvider],
  )

  const supportsManualSession = selectedProvider === 'betano' || selectedProvider === 'bet365'

  const loadProvidersStatus = async () => {
    try {
      const statusRows = await betAutomationApi.getProvidersStatus()
      setProvidersStatus(statusRows)
    } catch (err: unknown) {
      throw err
    }
  }

  const loadSessionStatus = async (provider: 'betano' | 'bet365', options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setIsSessionLoading(true)
    }

    try {
      const status = await betAutomationApi.getSessionStatus(provider)
      setSessionStatus(status)
    } catch (err: unknown) {
      if (!options?.silent) {
        setError(err instanceof Error ? err.message : 'Falha ao carregar status da sessao')
      }
    } finally {
      if (!options?.silent) {
        setIsSessionLoading(false)
      }
    }
  }

  const refreshManualSessionState = async (provider: 'betano' | 'bet365', options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setIsSessionLoading(true)
    }

    try {
      const [statusRows, session] = await Promise.all([
        betAutomationApi.getProvidersStatus(),
        betAutomationApi.getSessionStatus(provider),
      ])
      setProvidersStatus(statusRows)
      setSessionStatus(session)
    } catch (err: unknown) {
      if (!options?.silent) {
        setError(err instanceof Error ? err.message : 'Falha ao atualizar status da sessao')
      }
    } finally {
      if (!options?.silent) {
        setIsSessionLoading(false)
      }
    }
  }

  const loadData = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [, credentialRows] = await Promise.all([
        loadProvidersStatus(),
        bookmakerCredentialsApi.list(),
      ])
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
    setManualSessionResult(null)
    if (supportsManualSession) {
      void loadSessionStatus(selectedProvider)
      return
    }
    setSessionStatus(null)
  }, [selectedProvider])

  useEffect(() => {
    if (!supportsManualSession) return

    const intervalId = window.setInterval(() => {
      void refreshManualSessionState(selectedProvider, { silent: true })
    }, SESSION_STATUS_REFRESH_MS)

    return () => window.clearInterval(intervalId)
  }, [selectedProvider, supportsManualSession])

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
      if (supportsManualSession) {
        await loadSessionStatus(selectedProvider, { silent: true })
      }
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
      if (supportsManualSession) {
        await loadSessionStatus(selectedProvider, { silent: true })
      }
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

  const handleStartManualSession = async () => {
    if (!supportsManualSession) return
    setIsStartingSession(true)
    setError(null)
    setManualSessionResult(null)
    try {
      const response = await betAutomationApi.startManualSession(selectedProvider)
      setManualSessionResult(response)
      await refreshManualSessionState(selectedProvider)
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(String(err.response?.data?.message ?? err.message))
      } else {
        setError(err instanceof Error ? err.message : 'Falha ao abrir sessao manual')
      }
    } finally {
      setIsStartingSession(false)
    }
  }

  const handleCompleteManualSession = async () => {
    if (!supportsManualSession || !sessionStatus?.activeSessionId) return
    setIsCompletingSession(true)
    setError(null)
    try {
      const response = await betAutomationApi.completeManualSession(sessionStatus.activeSessionId)
      setManualSessionResult(response)
      await refreshManualSessionState(selectedProvider)
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(String(err.response?.data?.message ?? err.message))
      } else {
        setError(err instanceof Error ? err.message : 'Falha ao concluir sessao manual')
      }
    } finally {
      setIsCompletingSession(false)
    }
  }

  const handleClearSession = async () => {
    if (!supportsManualSession) return
    setIsClearingSession(true)
    setError(null)
    try {
      await betAutomationApi.clearSessionProfile(selectedProvider)
      setManualSessionResult(null)
      await refreshManualSessionState(selectedProvider)
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(String(err.response?.data?.message ?? err.message))
      } else {
        setError(err instanceof Error ? err.message : 'Falha ao limpar sessao salva')
      }
    } finally {
      setIsClearingSession(false)
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
                    <div className="mt-2 flex flex-wrap gap-2">
                      {provider.hasSavedSession && (
                        <span className="text-[11px] px-2 py-1 rounded bg-green-900/30 text-green-300 border border-green-500/30">
                          Sessao salva
                        </span>
                      )}
                      {provider.activeManualSession && (
                        <span className="text-[11px] px-2 py-1 rounded bg-blue-900/30 text-blue-300 border border-blue-500/30">
                          Sessao aberta
                        </span>
                      )}
                      {!provider.hasSavedSession && !provider.activeManualSession && (
                        <span className="text-[11px] px-2 py-1 rounded bg-gray-800 text-gray-400 border border-gray-700">
                          Sem sessao
                        </span>
                      )}
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

                {!!selectedProviderStatus?.hasSavedSession && (
                  <p className="text-xs text-green-300">
                    Existe uma sessao persistente salva para este provider. O fluxo vai tentar reutiliza-la e pular o login.
                  </p>
                )}

                {!!selectedProviderStatus?.activeManualSession && (
                  <p className="text-xs text-blue-300">
                    Existe uma sessao manual aberta agora. Finalize e salve a sessao antes de executar a automacao normal.
                  </p>
                )}
              </CardBody>
            </Card>
          </div>

          {supportsManualSession && (
            <Card>
              <CardHeader>
                <h3 className="font-semibold text-white">Sessao manual assistida - {PROVIDER_LABELS[selectedProvider]}</h3>
              </CardHeader>
              <CardBody className="space-y-4">
                {isSessionLoading ? (
                  <div className="flex items-center gap-2 text-sm text-gray-300">
                    <Spinner size="sm" /> Carregando status da sessao...
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <StatusBox label="Sessao manual aberta" value={sessionStatus?.activeManualSession ? 'Sim' : 'Nao'} tone={sessionStatus?.activeManualSession ? 'blue' : 'gray'} />
                      <StatusBox label="Sessao salva" value={sessionStatus?.hasSavedSession ? 'Sim' : 'Nao'} tone={sessionStatus?.hasSavedSession ? 'green' : 'gray'} />
                      <StatusBox label="Session ID" value={sessionStatus?.activeSessionId ?? '-'} tone="gray" />
                      <StatusBox label="Diretorio" value={sessionStatus?.sessionDir ?? '-'} tone="gray" />
                    </div>

                    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 text-sm text-gray-300 space-y-2">
                      <p>Use este fluxo quando a casa bloquear login automatizado com Cloudflare, splash page ou captcha.</p>
                      <p>Passos: abrir sessao manual, logar no navegador aberto, resolver bloqueios manualmente, depois concluir a sessao para persistir cookies/perfil.</p>
                      <p className="text-xs text-gray-400">Status atualizado automaticamente a cada {SESSION_STATUS_REFRESH_MS / 1000}s.</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={handleStartManualSession}
                        isLoading={isStartingSession}
                        disabled={!selectedProviderStatus?.isConfigured || isCompletingSession || isClearingSession}
                      >
                        Abrir sessao manual
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={handleCompleteManualSession}
                        isLoading={isCompletingSession}
                        disabled={!sessionStatus?.activeManualSession || !sessionStatus?.activeSessionId || isStartingSession || isClearingSession}
                      >
                        Concluir e salvar sessao
                      </Button>
                      <Button
                        variant="danger"
                        onClick={handleClearSession}
                        isLoading={isClearingSession}
                        disabled={(!sessionStatus?.hasSavedSession && !sessionStatus?.activeManualSession) || isStartingSession || isCompletingSession}
                      >
                        Limpar sessao salva
                      </Button>
                    </div>

                    {manualSessionResult && 'instructions' in manualSessionResult && Array.isArray(manualSessionResult.instructions) && (
                      <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
                        <div className="text-sm text-blue-200 font-medium mb-2">Instrucao da sessao manual</div>
                        <ul className="text-xs text-blue-100 space-y-1 list-disc list-inside">
                          {manualSessionResult.instructions.map((step, index) => (
                            <li key={`${step}-${index}`}>{step}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {manualSessionResult && (
                      <div className="text-xs text-gray-400 space-y-1">
                        {'sessionId' in manualSessionResult && <div>Session ID: {manualSessionResult.sessionId}</div>}
                        {'sessionDir' in manualSessionResult && <div>Diretorio: {manualSessionResult.sessionDir}</div>}
                        {'loginUrl' in manualSessionResult && <div>Login URL: {manualSessionResult.loginUrl}</div>}
                      </div>
                    )}
                  </>
                )}
              </CardBody>
            </Card>
          )}

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
                {result.executionId && <div className="text-sm text-gray-200">Execution ID: {result.executionId}</div>}
                <div className="text-sm text-gray-200">Provider: {PROVIDER_LABELS[result.provider]}</div>
                <div className="text-sm text-gray-200">Sucesso: {result.ok ? 'sim' : 'nao'}</div>
                {result.startedAt && <div className="text-sm text-gray-200">Inicio: {new Date(result.startedAt).toLocaleString('pt-BR')}</div>}
                {result.finishedAt && <div className="text-sm text-gray-200">Fim: {new Date(result.finishedAt).toLocaleString('pt-BR')}</div>}
                {typeof result.durationMs === 'number' && <div className="text-sm text-gray-200">Duracao: {result.durationMs} ms</div>}
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

function StatusBox({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'green' | 'blue' | 'gray'
}) {
  const toneClasses = {
    green: 'border-green-500/30 bg-green-900/10 text-green-300',
    blue: 'border-blue-500/30 bg-blue-900/10 text-blue-300',
    gray: 'border-gray-700 bg-gray-800 text-gray-300',
  }

  return (
    <div className={`rounded-lg border p-3 ${toneClasses[tone]}`}>
      <div className="text-[11px] uppercase tracking-wide opacity-80">{label}</div>
      <div className="text-sm mt-1 break-all">{value}</div>
    </div>
  )
}
