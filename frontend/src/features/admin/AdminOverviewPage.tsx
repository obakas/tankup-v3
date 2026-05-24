import { Link } from 'react-router-dom'
import type { DeliveryStatus } from '../../types/delivery'
import { useOperationsAlerts } from '../operations/hooks/useOperationsAlerts'
import { useOperationsDeliveries } from '../operations/hooks/useOperationsDeliveries'
import { useTheme } from '../operations/hooks/useTheme'
import type { OperationsDeliveryListItem } from '../operations/services/operationsApi'

const activeStatuses = new Set<DeliveryStatus>([
  'ASSIGNED',
  'LOADING',
  'EN_ROUTE',
  'ARRIVED',
  'MEASURING',
  'AWAITING_OTP',
])

const isAssignmentReadyDelivery = (delivery: OperationsDeliveryListItem) =>
  delivery.status === 'CREATED' &&
  delivery.identifiers.driverId === null &&
  delivery.identifiers.tankerId === null &&
  !delivery.assignment?.pendingOffer

const isProblemDelivery = (
  delivery: OperationsDeliveryListItem,
  alertDeliveryIds: Set<string>,
) =>
  delivery.status === 'FAILED' ||
  delivery.status === 'SKIPPED' ||
  delivery.activeAlertsCount > 0 ||
  alertDeliveryIds.has(delivery.id)

const formatDateTime = (value: string | null) => {
  if (!value) {
    return 'Not loaded'
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default function AdminOverviewPage() {
  const deliveriesQuery = useOperationsDeliveries({ limit: 200 })
  const alertsQuery = useOperationsAlerts()
  const { theme, toggleTheme } = useTheme()

  const alertDeliveryIds = new Set(
    alertsQuery.alerts.map((alert) => alert.deliveryId),
  )
  const deliveries = deliveriesQuery.deliveries
  const totalDeliveries = deliveries.length
  const activeDeliveries = deliveries.filter((delivery) =>
    activeStatuses.has(delivery.status),
  ).length
  const completedDeliveries = deliveries.filter(
    (delivery) => delivery.status === 'COMPLETED',
  ).length
  const failedProblemDeliveries = deliveries.filter((delivery) =>
    isProblemDelivery(delivery, alertDeliveryIds),
  ).length
  const assignmentReadyDeliveries = deliveries.filter(
    isAssignmentReadyDelivery,
  ).length
  const loading = deliveriesQuery.loading || alertsQuery.loading
  const refreshing = deliveriesQuery.refreshing || alertsQuery.refreshing
  const unavailable = deliveriesQuery.error || alertsQuery.error
  const latestGeneratedAt =
    deliveriesQuery.generatedAt ?? alertsQuery.generatedAt ?? null

  const handleRefresh = () => {
    void deliveriesQuery.refetch()
    void alertsQuery.refetch()
  }

  const metrics = [
    {
      label: 'Total Deliveries',
      value: totalDeliveries,
      detail: 'latest 200 from operations API',
    },
    {
      label: 'Active Deliveries',
      value: activeDeliveries,
      detail: 'assigned through awaiting OTP',
    },
    {
      label: 'Completed Deliveries',
      value: completedDeliveries,
      detail: 'terminal completed status',
    },
    {
      label: 'Failed / Problem',
      value: failedProblemDeliveries,
      detail: 'failed, skipped, or alerting',
    },
    {
      label: 'Assignment Ready',
      value: assignmentReadyDeliveries,
      detail: 'created with no driver or tanker',
    },
  ]

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-5 text-left text-slate-950 transition-colors dark:bg-slate-950 dark:text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
              Admin
            </p>
            <h1 className="!m-0 mt-1 !text-2xl !font-semibold !tracking-normal text-slate-950 dark:text-slate-50 sm:!text-3xl">
              Overview
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <span className="rounded-full border border-slate-300 bg-white px-3 py-1 dark:border-slate-700 dark:bg-slate-900">
              Updated {formatDateTime(latestGeneratedAt)}
            </span>
            <button
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 transition hover:border-cyan-600 hover:text-cyan-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-cyan-400 dark:hover:text-cyan-300"
              onClick={toggleTheme}
              type="button"
            >
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
            <button
              className="h-9 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:bg-slate-300 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
              disabled={loading || refreshing}
              onClick={handleRefresh}
              type="button"
            >
              {loading || refreshing ? 'Refreshing' : 'Refresh'}
            </button>
          </div>
        </header>

        {unavailable ? (
          <section className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            {unavailable}
          </section>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {metrics.map((metric) => (
            <article
              className="rounded-md border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              key={metric.label}
            >
              <p className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                {metric.label}
              </p>
              <p className="mt-2 break-words text-3xl font-semibold leading-tight text-slate-950 dark:text-slate-50">
                {loading ? '...' : metric.value}
              </p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {metric.detail}
              </p>
            </article>
          ))}
        </section>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="!m-0 !text-lg !font-semibold !tracking-normal text-slate-950 dark:text-slate-50">
                  Delivery Mix
                </h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  Current operational status split from the visible delivery set.
                </p>
              </div>
              <span className="mt-2 rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold uppercase tracking-normal text-slate-500 dark:border-slate-700 dark:text-slate-400 sm:mt-0">
                {totalDeliveries} total
              </span>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {[
                'CREATED',
                'ASSIGNED',
                'LOADING',
                'EN_ROUTE',
                'ARRIVED',
                'MEASURING',
                'AWAITING_OTP',
                'COMPLETED',
                'FAILED',
                'SKIPPED',
              ].map((status) => {
                const count = deliveries.filter(
                  (delivery) => delivery.status === status,
                ).length

                return (
                  <div
                    className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950"
                    key={status}
                  >
                    <p className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                      {status.replaceAll('_', ' ')}
                    </p>
                    <p className="mt-1 text-xl font-semibold text-slate-950 dark:text-slate-50">
                      {loading ? '...' : count}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>

          <Link
            className="flex min-h-56 flex-col justify-between rounded-md border border-cyan-200 bg-cyan-50 p-4 text-slate-950 shadow-sm transition hover:border-cyan-500 hover:bg-cyan-100 dark:border-cyan-900 dark:bg-cyan-950/40 dark:text-slate-50 dark:hover:border-cyan-500 dark:hover:bg-cyan-950/70"
            to="/operations"
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-normal text-cyan-700 dark:text-cyan-300">
                Operations Dashboard
              </p>
              <h2 className="!m-0 mt-2 !text-xl !font-semibold !tracking-normal text-slate-950 dark:text-slate-50">
                Open Control Room
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-700 dark:text-slate-300">
                Review live deliveries, active alerts, driver actions,
                assignment visibility, and delivery timelines.
              </p>
            </div>
            <span className="mt-6 inline-flex h-9 w-fit items-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white dark:bg-cyan-400 dark:text-slate-950">
              View operations
            </span>
          </Link>
        </section>
      </div>
    </main>
  )
}
