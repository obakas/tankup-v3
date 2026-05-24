import { useEffect, useMemo, useRef, useState } from 'react'
import type { DeliveryStatus } from '../../../types/delivery'
import { useOperationsDeliveries } from '../hooks/useOperationsDeliveries'
import type {
  OperationsDeliveriesFilters,
  OperationsDeliveryListItem,
} from '../services/operationsApi'

type LiveDeliveriesBoardProps = {
  refreshSignal: number
  selectedDeliveryId: string | null
  onVisibleDeliveriesChange?: (snapshot: LiveDeliveriesSnapshot) => void
  onSelectDelivery: (deliveryId: string) => void
}

type DemoVisibility = 'all' | 'demo' | 'non-demo'

export type LiveDeliveriesSnapshot = {
  deliveries: OperationsDeliveryListItem[]
  loading: boolean
  refreshing: boolean
  error: string | null
}

const deliveryStatuses: DeliveryStatus[] = [
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
]

const limitOptions = [25, 50, 100, 200]

const demoVisibilityOptions: { label: string; value: DemoVisibility }[] = [
  { label: 'All deliveries', value: 'all' },
  { label: 'Demo only', value: 'demo' },
  { label: 'Non-demo only', value: 'non-demo' },
]

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))

const groupDeliveriesByStatus = (deliveries: OperationsDeliveryListItem[]) =>
  deliveries.reduce<Record<DeliveryStatus, OperationsDeliveryListItem[]>>(
    (groups, delivery) => ({
      ...groups,
      [delivery.status]: [...groups[delivery.status], delivery],
    }),
    {
      CREATED: [],
      ASSIGNED: [],
      LOADING: [],
      EN_ROUTE: [],
      ARRIVED: [],
      MEASURING: [],
      AWAITING_OTP: [],
      COMPLETED: [],
      FAILED: [],
      SKIPPED: [],
    },
  )

const getPrimaryIdentifier = (delivery: OperationsDeliveryListItem) =>
  delivery.identifiers.requestId ??
  delivery.identifiers.orderId ??
  delivery.identifiers.customerId ??
  'No customer/request ID'

const getDeliveryCardClass = (selected: boolean) =>
  [
    'rounded-md border p-3 text-left transition',
    selected
      ? 'border-cyan-700 bg-cyan-50 shadow-sm dark:border-cyan-500 dark:bg-cyan-950/40'
      : 'border-slate-200 bg-white hover:border-cyan-600 hover:bg-cyan-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-cyan-500 dark:hover:bg-cyan-950/30',
  ].join(' ')

const getAssignmentLabel = (delivery: OperationsDeliveryListItem) => {
  const assignment = delivery.assignment

  if (!assignment) {
    return null
  }

  if (assignment.pendingOffer) {
    return 'Offer PENDING'
  }

  if (assignment.lastAssignmentDecision) {
    return `Last ${assignment.lastAssignmentDecision.result}`
  }

  if (assignment.retryCount !== null && assignment.retryCount !== undefined) {
    return `${assignment.retryCount} retr${assignment.retryCount === 1 ? 'y' : 'ies'}`
  }

  return null
}

const filterDeliveriesByDemoVisibility = (
  deliveries: OperationsDeliveryListItem[],
  demoVisibility: DemoVisibility,
) => {
  if (demoVisibility === 'demo') {
    return deliveries.filter((delivery) => delivery.isDemoScenario)
  }

  if (demoVisibility === 'non-demo') {
    return deliveries.filter((delivery) => !delivery.isDemoScenario)
  }

  return deliveries
}

export default function LiveDeliveriesBoard({
  refreshSignal,
  selectedDeliveryId,
  onVisibleDeliveriesChange,
  onSelectDelivery,
}: LiveDeliveriesBoardProps) {
  const lastRefreshSignal = useRef(refreshSignal)
  const [manualDeliveryId, setManualDeliveryId] = useState('')
  const [status, setStatus] = useState<DeliveryStatus | ''>('')
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(50)
  const [demoVisibility, setDemoVisibility] = useState<DemoVisibility>('all')

  const filters = useMemo<OperationsDeliveriesFilters>(
    () => ({
      limit,
      ...(status ? { status } : {}),
      ...(search.trim() ? { search: search.trim() } : {}),
    }),
    [limit, search, status],
  )
  const deliveriesQuery = useOperationsDeliveries(filters)
  const visibleDeliveries = useMemo(
    () =>
      filterDeliveriesByDemoVisibility(
        deliveriesQuery.deliveries,
        demoVisibility,
      ),
    [deliveriesQuery.deliveries, demoVisibility],
  )
  const groupedDeliveries = useMemo(
    () => groupDeliveriesByStatus(visibleDeliveries),
    [visibleDeliveries],
  )

  const visibleStatuses = deliveryStatuses.filter(
    (deliveryStatus) => groupedDeliveries[deliveryStatus].length > 0,
  )

  useEffect(() => {
    if (lastRefreshSignal.current === refreshSignal) {
      return
    }

    lastRefreshSignal.current = refreshSignal
    void deliveriesQuery.refetch()
  }, [deliveriesQuery, refreshSignal])

  useEffect(() => {
    onVisibleDeliveriesChange?.({
      deliveries: visibleDeliveries,
      loading: deliveriesQuery.loading,
      refreshing: deliveriesQuery.refreshing,
      error: deliveriesQuery.error,
    })
  }, [
    deliveriesQuery.error,
    deliveriesQuery.loading,
    deliveriesQuery.refreshing,
    onVisibleDeliveriesChange,
    visibleDeliveries,
  ])

  const submitManualDelivery = () => {
    const nextDeliveryId = manualDeliveryId.trim()

    if (nextDeliveryId) {
      onSelectDelivery(nextDeliveryId)
      setManualDeliveryId('')
    }
  }

  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="!m-0 !text-lg !font-semibold !tracking-normal text-slate-950 dark:text-slate-50">
              Live Deliveries Board
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Deliveries from the operations delivery list.
            </p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Last updated:{' '}
              {deliveriesQuery.generatedAt
                ? formatDateTime(deliveriesQuery.generatedAt)
                : 'Never'}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="sr-only" htmlFor="manual-delivery-id">
              Delivery ID
            </label>
            <input
              className="h-10 min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-cyan-400 dark:focus:ring-cyan-900/50"
              id="manual-delivery-id"
              onChange={(event) => setManualDeliveryId(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  submitManualDelivery()
                }
              }}
              placeholder="Open delivery ID"
              value={manualDeliveryId}
            />
            <button
              className="h-10 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
              disabled={!manualDeliveryId.trim()}
              onClick={submitManualDelivery}
              type="button"
            >
              Open
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_160px_140px_auto]">
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
            Search
            <input
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal normal-case text-slate-950 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-cyan-400 dark:focus:ring-cyan-900/50"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Delivery, customer, driver, tanker, site"
              value={search}
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
            Status
            <select
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal normal-case text-slate-950 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-cyan-400 dark:focus:ring-cyan-900/50"
              onChange={(event) =>
                setStatus(event.target.value as DeliveryStatus | '')
              }
              value={status}
            >
              <option value="">All statuses</option>
              {deliveryStatuses.map((deliveryStatus) => (
                <option key={deliveryStatus} value={deliveryStatus}>
                  {deliveryStatus}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
            Limit
            <select
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal normal-case text-slate-950 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-cyan-400 dark:focus:ring-cyan-900/50"
              onChange={(event) => setLimit(Number(event.target.value))}
              value={limit}
            >
              {limitOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
            Demo
            <select
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal normal-case text-slate-950 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-cyan-400 dark:focus:ring-cyan-900/50"
              onChange={(event) =>
                setDemoVisibility(event.target.value as DemoVisibility)
              }
              value={demoVisibility}
            >
              {demoVisibilityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end">
            <button
              className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-800 transition hover:border-cyan-600 hover:text-cyan-700 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:text-slate-100 dark:hover:border-cyan-400 dark:hover:text-cyan-300 md:w-auto"
              disabled={deliveriesQuery.loading || deliveriesQuery.refreshing}
              onClick={deliveriesQuery.refetch}
              type="button"
            >
              {deliveriesQuery.refreshing ? 'Refreshing' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      {deliveriesQuery.loading ? (
        <div className="py-10 text-center text-sm text-slate-600 dark:text-slate-300">
          Loading operations deliveries.
        </div>
      ) : null}

      {!deliveriesQuery.loading && deliveriesQuery.error ? (
        <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
          {deliveriesQuery.error}
        </div>
      ) : null}

      {!deliveriesQuery.loading &&
      !deliveriesQuery.error &&
      visibleDeliveries.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-600 dark:text-slate-300">
          No deliveries match the current filters.
        </div>
      ) : null}

      {!deliveriesQuery.loading &&
      !deliveriesQuery.error &&
      visibleDeliveries.length > 0 ? (
        <div className="mt-4 flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600 dark:text-slate-300">
            <span>
              Showing {visibleDeliveries.length} delivery
              {visibleDeliveries.length === 1 ? '' : 'ies'}
            </span>
            <span>
              Last updated{' '}
              {deliveriesQuery.generatedAt
                ? formatDateTime(deliveriesQuery.generatedAt)
                : 'unknown'}
            </span>
          </div>

          {visibleStatuses.map((deliveryStatus) => (
            <div className="rounded-md border border-slate-200 dark:border-slate-800" key={deliveryStatus}>
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
                <h3 className="text-sm font-semibold text-slate-950 dark:text-slate-50">
                  {deliveryStatus}
                </h3>
                <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                  {groupedDeliveries[deliveryStatus].length}
                </span>
              </div>

              <div className="grid gap-3 p-3 lg:grid-cols-2">
                {groupedDeliveries[deliveryStatus].map((delivery) => {
                  const selected = selectedDeliveryId === delivery.id
                  const assignmentLabel = getAssignmentLabel(delivery)

                  return (
                    <button
                      className={getDeliveryCardClass(selected)}
                      key={delivery.id}
                      onClick={() => onSelectDelivery(delivery.id)}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <p className="truncate font-mono text-xs text-slate-700 dark:text-slate-300">
                              {delivery.id}
                            </p>
                            {delivery.isDemoScenario ? (
                              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-xs font-semibold text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-200">
                                Demo
                              </span>
                            ) : null}
                            {assignmentLabel ? (
                              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                                {assignmentLabel}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 truncate text-sm font-semibold text-slate-950 dark:text-slate-50">
                            {getPrimaryIdentifier(delivery)}
                          </p>
                          {delivery.demoScenarioName ? (
                            <p className="mt-1 truncate text-xs text-slate-600 dark:text-slate-300">
                              {delivery.demoScenarioName}
                            </p>
                          ) : null}
                        </div>
                        <span className="shrink-0 rounded-full border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          {delivery.activeAlertsCount} alert
                          {delivery.activeAlertsCount === 1 ? '' : 's'}
                        </span>
                      </div>

                      <div className="mt-3 grid gap-2 text-xs text-slate-600 dark:text-slate-300 sm:grid-cols-2">
                        <div className="min-w-0">
                          <p className="font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                            Driver
                          </p>
                          <p className="truncate">
                            {delivery.identifiers.driverId ?? 'Unassigned'}
                          </p>
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                            Tanker
                          </p>
                          <p className="truncate">
                            {delivery.identifiers.tankerId ?? 'Unassigned'}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 rounded-md bg-slate-50 p-3 dark:bg-slate-900">
                        <p className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                          Last Event
                        </p>
                        <p className="mt-1 truncate text-sm font-semibold text-slate-950 dark:text-slate-50">
                          {delivery.lastEvent?.type ?? 'No event'}
                        </p>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                          {delivery.lastEvent
                            ? formatDateTime(delivery.lastEvent.createdAt)
                            : 'No event recorded'}
                        </p>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-300">
                        <span>Updated {formatDateTime(delivery.updatedAt)}</span>
                        <span className="font-semibold text-cyan-700 dark:text-cyan-300">
                          {selected ? 'Selected' : 'Inspect'}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}
