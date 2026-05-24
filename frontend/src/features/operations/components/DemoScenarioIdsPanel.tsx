import { useEffect, useMemo, useState } from 'react'
import type { DeliveryStatus } from '../../../types/delivery'

type DemoScenarioIdsPanelProps = {
  selectedDeliveryId: string | null
  onSelectDelivery: (deliveryId: string) => void
}

type DemoScenarioEntry = {
  name: string
  key: string | null
  deliveryId: string
  status: DeliveryStatus | string | null
}

const storageKey = 'tankup.operations.demoScenarioIds'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const parseScenarioMap = (rawValue: string): DemoScenarioEntry[] => {
  const parsed: unknown = JSON.parse(rawValue)

  if (!isRecord(parsed)) {
    throw new Error('Expected a JSON object keyed by scenario name.')
  }

  const entries = Object.entries(parsed).map(([name, value]) => {
    if (!isRecord(value)) {
      throw new Error(`Scenario "${name}" must be an object.`)
    }

    if (typeof value.deliveryId !== 'string' || !value.deliveryId.trim()) {
      throw new Error(`Scenario "${name}" is missing deliveryId.`)
    }

    return {
      name,
      key: typeof value.key === 'string' ? value.key : null,
      deliveryId: value.deliveryId.trim(),
      status: typeof value.status === 'string' ? value.status : null,
    }
  })

  return entries.sort((left, right) => left.name.localeCompare(right.name))
}

export default function DemoScenarioIdsPanel({
  selectedDeliveryId,
  onSelectDelivery,
}: DemoScenarioIdsPanelProps) {
  const [rawJson, setRawJson] = useState('')
  const [savedJson, setSavedJson] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const storedValue = window.localStorage.getItem(storageKey) ?? ''
    setRawJson(storedValue)
    setSavedJson(storedValue)
  }, [])

  const scenarios = useMemo(() => {
    if (!savedJson.trim()) {
      return []
    }

    try {
      return parseScenarioMap(savedJson)
    } catch {
      return []
    }
  }, [savedJson])

  const saveScenarioMap = () => {
    setError(null)

    try {
      const parsedEntries = parseScenarioMap(rawJson)
      const normalizedJson = JSON.stringify(
        Object.fromEntries(
          parsedEntries.map((entry) => [
            entry.name,
            {
              key: entry.key,
              deliveryId: entry.deliveryId,
              status: entry.status,
            },
          ]),
        ),
        null,
        2,
      )

      window.localStorage.setItem(storageKey, normalizedJson)
      setRawJson(normalizedJson)
      setSavedJson(normalizedJson)
    } catch (parseError) {
      setError(
        parseError instanceof Error
          ? parseError.message
          : 'Unable to parse scenario JSON.',
      )
    }
  }

  const clearScenarioMap = () => {
    window.localStorage.removeItem(storageKey)
    setRawJson('')
    setSavedJson('')
    setError(null)
  }

  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-200 pb-4 dark:border-slate-800">
        <h2 className="!m-0 !text-lg !font-semibold !tracking-normal text-slate-950 dark:text-slate-50">
          Demo Scenario IDs
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Paste the JSON map printed by `npm run demo:reset`.
        </p>
      </div>

      <label className="mt-4 flex flex-col gap-2 text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
        Scenario JSON
        <textarea
          className="min-h-36 rounded-md border border-slate-300 bg-white p-3 font-mono text-xs font-normal normal-case text-slate-950 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-cyan-400 dark:focus:ring-cyan-900/50"
          onChange={(event) => setRawJson(event.target.value)}
          placeholder='{"healthy delivery":{"key":"healthy-delivery","deliveryId":"...","status":"EN_ROUTE"}}'
          value={rawJson}
        />
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
          disabled={!rawJson.trim()}
          onClick={saveScenarioMap}
          type="button"
        >
          Save Map
        </button>
        <button
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 transition hover:border-cyan-600 hover:text-cyan-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-100 dark:hover:border-cyan-400 dark:hover:text-cyan-300"
          disabled={!rawJson && !savedJson}
          onClick={clearScenarioMap}
          type="button"
        >
          Clear Saved
        </button>
      </div>

      {error ? (
        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </div>
      ) : null}

      {scenarios.length === 0 && !error ? (
        <div className="mt-4 rounded-md border border-slate-200 p-4 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
          No saved demo scenario IDs.
        </div>
      ) : null}

      {scenarios.length > 0 ? (
        <div className="mt-4 flex max-h-80 flex-col gap-2 overflow-auto pr-1">
          {scenarios.map((scenario) => {
            const selected = selectedDeliveryId === scenario.deliveryId

            return (
              <button
                className={[
                  'rounded-md border p-3 text-left transition',
                  selected
                    ? 'border-cyan-700 bg-cyan-50 dark:border-cyan-500 dark:bg-cyan-950/40'
                    : 'border-slate-200 hover:border-cyan-600 hover:bg-cyan-50 dark:border-slate-800 dark:hover:border-cyan-500 dark:hover:bg-cyan-950/30',
                ].join(' ')}
                key={`${scenario.name}-${scenario.deliveryId}`}
                onClick={() => onSelectDelivery(scenario.deliveryId)}
                type="button"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">
                    {scenario.name}
                  </p>
                  {scenario.status ? (
                    <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {scenario.status}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 truncate font-mono text-xs text-slate-600 dark:text-slate-300">
                  {scenario.deliveryId}
                </p>
              </button>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
