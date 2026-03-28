import { useEffect, useState } from 'react'
import { dataIngestionApi } from '../services/api'
import type {
  IngestionLog,
  IngestionLogFilters,
  IngestionRunStatus,
  IngestionSummary,
  IngestionTriggerType,
  IngestionProcessType,
} from '../types'
import { Card, CardBody, CardHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input, Select } from '../components/ui/Input'
import { Spinner } from '../components/ui/Spinner'
import { useI18n } from '../hooks/useI18n'

function StatusPill({ status, successLabel, partialLabel, failedLabel }: { status: IngestionRunStatus; successLabel: string; partialLabel: string; failedLabel: string }) {
  const cls = status === 'success'
    ? 'bg-green-900/60 text-green-300 border-green-700'
    : status === 'partial'
      ? 'bg-amber-900/60 text-amber-300 border-amber-700'
      : 'bg-red-900/60 text-red-300 border-red-700'

  const label = status === 'success' ? successLabel : status === 'partial' ? partialLabel : failedLabel
  return <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase ${cls}`}>{label}</span>
}

function TriggerPill({ trigger, cronLabel, manualLabel }: { trigger: IngestionTriggerType; cronLabel: string; manualLabel: string }) {
  const cls = trigger === 'cron'
    ? 'bg-blue-900/60 text-blue-300 border-blue-700'
    : 'bg-gray-700 text-gray-300 border-gray-600'

  return <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase ${cls}`}>{trigger === 'cron' ? cronLabel : manualLabel}</span>
}

export default function DataIngestion() {
  const [logs, setLogs] = useState<IngestionLog[]>([])
  const [filters, setFilters] = useState<IngestionLogFilters>({
    limit: 20,
    processType: 'all',
    trigger: 'all',
    status: 'all',
    fallbackUsed: 'all',
  })
  const [leagueId, setLeagueId] = useState('39')
  const [date, setDate] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isRunningFixtures, setIsRunningFixtures] = useState(false)
  const [isRunningOdds, setIsRunningOdds] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRun, setLastRun] = useState<IngestionSummary | null>(null)
  const { dict } = useI18n()

  const loadLogs = async (nextFilters: IngestionLogFilters = filters) => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await dataIngestionApi.getLogs(nextFilters)
      setLogs(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : dict.ingestion.failedToLoadLogs)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadLogs(filters)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleFilterChange = <K extends keyof IngestionLogFilters>(key: K, value: IngestionLogFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const applyFilters = () => {
    void loadLogs(filters)
  }

  const runFixtures = async () => {
    setIsRunningFixtures(true)
    setError(null)
    try {
      const summary = await dataIngestionApi.runFixtureSync({
        leagueId: leagueId || undefined,
        date: date || undefined,
      })
      setLastRun(summary)
      await loadLogs(filters)
    } catch (err) {
      setError(err instanceof Error ? err.message : dict.ingestion.failedRunFixtures)
    } finally {
      setIsRunningFixtures(false)
    }
  }

  const runOdds = async () => {
    setIsRunningOdds(true)
    setError(null)
    try {
      const summary = await dataIngestionApi.runOddsIngestion({
        leagueId: leagueId || undefined,
        date: date || undefined,
      })
      setLastRun(summary)
      await loadLogs(filters)
    } catch (err) {
      setError(err instanceof Error ? err.message : dict.ingestion.failedRunOdds)
    } finally {
      setIsRunningOdds(false)
    }
  }

  const latest = logs[0]
  const successCount = logs.filter((log) => log.status === 'success').length
  const fallbackCount = logs.filter((log) => log.fallbackUsed).length

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{dict.ingestion.title}</h1>
          <p className="text-sm text-gray-400 mt-1">{dict.ingestion.subtitle}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void loadLogs(filters)}>{dict.ingestion.refreshLogs}</Button>
          <Button variant="secondary" onClick={runFixtures} isLoading={isRunningFixtures}>{dict.ingestion.runFixtures}</Button>
          <Button variant="primary" onClick={runOdds} isLoading={isRunningOdds}>{dict.ingestion.runOdds}</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><CardBody className="py-4"><div className="text-xs text-gray-400 uppercase mb-1">{dict.ingestion.latestStatus}</div><div className="text-white text-xl font-bold">{latest ? latest.status : dict.ingestion.noRuns}</div></CardBody></Card>
        <Card><CardBody className="py-4"><div className="text-xs text-gray-400 uppercase mb-1">{dict.ingestion.successfulRuns}</div><div className="text-white text-xl font-bold">{successCount}</div></CardBody></Card>
        <Card><CardBody className="py-4"><div className="text-xs text-gray-400 uppercase mb-1">{dict.ingestion.fallbackRuns}</div><div className="text-white text-xl font-bold">{fallbackCount}</div></CardBody></Card>
        <Card><CardBody className="py-4"><div className="text-xs text-gray-400 uppercase mb-1">{dict.ingestion.latestFixtures}</div><div className="text-white text-xl font-bold">{latest?.fixturesFetched ?? 0}</div></CardBody></Card>
      </div>

      <Card>
        <CardHeader><h2 className="font-semibold text-white">{dict.ingestion.manualRun}</h2></CardHeader>
        <CardBody className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input label={dict.ingestion.leagueId} value={leagueId} onChange={(e) => setLeagueId(e.target.value)} placeholder="39" />
          <Input label={dict.ingestion.date} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <div className="text-sm text-gray-400 self-end pb-2">{dict.ingestion.emptyDateHint}</div>
        </CardBody>
      </Card>

      {lastRun && (
        <Card>
          <CardHeader><h2 className="font-semibold text-white">{dict.ingestion.lastTriggerResult}</h2></CardHeader>
          <CardBody className="grid grid-cols-2 md:grid-cols-6 gap-4 text-sm">
            <div><div className="text-gray-400">{dict.ingestion.date}</div><div className="text-white font-medium">{lastRun.date}</div></div>
            <div><div className="text-gray-400">{dict.ingestion.league}</div><div className="text-white font-medium">{lastRun.leagueId}</div></div>
            <div><div className="text-gray-400">{dict.ingestion.fixtures}</div><div className="text-white font-medium">{lastRun.fixturesFetched}</div></div>
            <div><div className="text-gray-400">{dict.ingestion.matchesUpserted}</div><div className="text-white font-medium">{lastRun.matchesUpserted}</div></div>
            <div><div className="text-gray-400">{dict.ingestion.oddsSaved}</div><div className="text-white font-medium">{lastRun.oddsSaved}</div></div>
            <div><div className="text-gray-400">{dict.ingestion.fallback}</div><div className="text-white font-medium">{lastRun.fallbackUsed ? lastRun.fallbackDate ?? dict.ingestion.yes : dict.ingestion.no}</div></div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader><h2 className="font-semibold text-white">{dict.ingestion.logFilters}</h2></CardHeader>
        <CardBody className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Select label={dict.ingestion.process} value={filters.processType ?? 'all'} onChange={(e) => handleFilterChange('processType', e.target.value as IngestionProcessType | 'all')}>
            <option value="all">{dict.ingestion.all}</option>
            <option value="fixtures">{dict.ingestion.fixtures}</option>
            <option value="odds">{dict.simulator.odds}</option>
          </Select>
          <Select label={dict.ingestion.trigger} value={filters.trigger ?? 'all'} onChange={(e) => handleFilterChange('trigger', e.target.value as IngestionTriggerType | 'all')}>
            <option value="all">{dict.ingestion.all}</option>
            <option value="cron">{dict.ingestion.triggerCron}</option>
            <option value="manual">{dict.ingestion.triggerManual}</option>
          </Select>
          <Select label={dict.ingestion.status} value={filters.status ?? 'all'} onChange={(e) => handleFilterChange('status', e.target.value as IngestionRunStatus | 'all')}>
            <option value="all">{dict.ingestion.all}</option>
            <option value="success">{dict.ingestion.statusSuccess}</option>
            <option value="partial">{dict.ingestion.statusPartial}</option>
            <option value="failed">{dict.ingestion.statusFailed}</option>
          </Select>
          <Select label={dict.ingestion.fallback} value={filters.fallbackUsed ?? 'all'} onChange={(e) => handleFilterChange('fallbackUsed', e.target.value as 'true' | 'false' | 'all')}>
            <option value="all">{dict.ingestion.all}</option>
            <option value="true">{dict.ingestion.used}</option>
            <option value="false">{dict.ingestion.notUsed}</option>
          </Select>
          <div className="flex items-end gap-2">
            <Input label={dict.ingestion.limit} type="number" min="1" max="100" value={String(filters.limit ?? 20)} onChange={(e) => handleFilterChange('limit', Number(e.target.value || 20))} />
            <Button variant="primary" onClick={applyFilters}>{dict.ingestion.apply}</Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h2 className="font-semibold text-white">{dict.ingestion.executionLogs}</h2></CardHeader>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : logs.length === 0 ? (
            <div className="px-5 py-10 text-center text-gray-400">{dict.ingestion.noLogsForFilters}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700 text-left text-xs uppercase text-gray-400">
                    <th className="px-5 py-3">{dict.ingestion.started}</th>
                    <th className="px-5 py-3">{dict.ingestion.process}</th>
                    <th className="px-5 py-3">{dict.ingestion.trigger}</th>
                    <th className="px-5 py-3">{dict.ingestion.status}</th>
                    <th className="px-5 py-3">{dict.ingestion.dateRange}</th>
                    <th className="px-5 py-3">{dict.ingestion.fallback}</th>
                    <th className="px-5 py-3">{dict.ingestion.metrics}</th>
                    <th className="px-5 py-3">{dict.ingestion.error}</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log._id} className="border-b border-gray-700 align-top hover:bg-gray-700/20">
                      <td className="px-5 py-4 text-gray-300 whitespace-nowrap">{new Date(log.startedAt).toLocaleString()}</td>
                      <td className="px-5 py-4 text-white font-medium uppercase">{log.processType}</td>
                      <td className="px-5 py-4"><TriggerPill trigger={log.trigger} cronLabel={dict.ingestion.triggerCron} manualLabel={dict.ingestion.triggerManual} /></td>
                      <td className="px-5 py-4"><StatusPill status={log.status} successLabel={dict.ingestion.statusSuccess} partialLabel={dict.ingestion.statusPartial} failedLabel={dict.ingestion.statusFailed} /></td>
                      <td className="px-5 py-4 text-gray-300">{log.date}</td>
                      <td className="px-5 py-4 text-gray-300">{log.fallbackUsed ? `${dict.ingestion.yes} (${log.fallbackDate ?? '-'})` : dict.ingestion.no}</td>
                      <td className="px-5 py-4 text-gray-300">
                        <div>{dict.ingestion.fixtures}: {log.fixturesFetched}</div>
                        <div>{dict.ingestion.matchesUpserted}: {log.matchesUpserted}</div>
                        <div>{dict.ingestion.oddsSaved}: {log.oddsSaved}</div>
                        <div>{dict.ingestion.noOdds}: {log.fixturesWithNoOdds}</div>
                        <div>{dict.ingestion.duration}: {log.durationMs}ms</div>
                      </td>
                      <td className="px-5 py-4 text-xs text-red-300 max-w-sm">
                        {log.errorMessage ?? (log.errorList.length > 0 ? log.errorList.join(' | ') : '-')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {error && (
        <div className="rounded-lg border border-red-700 bg-red-900/30 px-4 py-3 text-sm text-red-300">{error}</div>
      )}
    </div>
  )
}