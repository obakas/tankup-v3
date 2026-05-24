import type { DeliveryAlertCandidate } from '../services/operationsApi'

type OperationalAlertsPanelProps = {
  alerts: DeliveryAlertCandidate[]
  error: string | null
  generatedAt: string | null
  loading: boolean
  refreshing: boolean
  selectedDeliveryId: string | null
  onRefresh: () => void
  onSelectDelivery: (deliveryId: string) => void
}

const formatTime = (value: string | null) => {
  if (!value) {
    return 'Never'
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
}

export default function OperationalAlertsPanel({
  alerts,
  error,
  generatedAt,
  loading,
  refreshing,
  selectedDeliveryId,
  onRefresh,
  onSelectDelivery,
}: OperationalAlertsPanelProps) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div>
          <h2 className="!m-0 !text-lg !font-semibold !tracking-normal text-slate-950 dark:text-slate-50">
            Operational Alerts
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Last updated: {formatTime(generatedAt)}
          </p>
        </div>
        <button
          className="h-9 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-800 transition hover:border-cyan-600 hover:text-cyan-700 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:text-slate-100 dark:hover:border-cyan-400 dark:hover:text-cyan-300"
          disabled={loading || refreshing}
          onClick={onRefresh}
          type="button"
        >
          {refreshing ? 'Refreshing' : 'Refresh'}
        </button>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-slate-600 dark:text-slate-300">
          Loading operational alerts.
        </div>
      ) : null}

      {!loading && error ? (
        <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </div>
      ) : null}

      {!loading && !error && alerts.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-600 dark:text-slate-300">
          No operational alerts detected.
        </div>
      ) : null}

      {!loading && alerts.length > 0 ? (
        <div className="mt-4 flex max-h-[520px] flex-col gap-3 overflow-auto pr-1">
          {alerts.map((alert) => (
            <button
              className="rounded-md border border-slate-200 p-3 text-left transition hover:border-cyan-600 hover:bg-cyan-50 disabled:border-cyan-700 disabled:bg-cyan-50 dark:border-slate-800 dark:hover:border-cyan-500 dark:hover:bg-cyan-950/30 dark:disabled:border-cyan-500 dark:disabled:bg-cyan-950/40"
              disabled={selectedDeliveryId === alert.deliveryId}
              key={`${alert.deliveryId}-${alert.type}`}
              onClick={() => onSelectDelivery(alert.deliveryId)}
              type="button"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">
                  {alert.severity}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {alert.status}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {alert.ageMinutes} min
                </span>
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-950 dark:text-slate-50">
                {alert.message}
              </p>
              <p className="mt-2 truncate font-mono text-xs text-slate-500 dark:text-slate-400">
                {alert.deliveryId}
              </p>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  )
}
