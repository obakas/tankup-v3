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
  onSelectDelivery: (deliveryId: string) => void
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
      ? 'border-cyan-700 bg-cyan-50 shadow-sm'
      : 'border-slate-200 bg-white hover:border-cyan-600 hover:bg-cyan-50',
  ].join(' ')

export default function LiveDeliveriesBoard({
  refreshSignal,
  selectedDeliveryId,
  onSelectDelivery,
}: LiveDeliveriesBoardProps) {
  const lastRefreshSignal = useRef(refreshSignal)
  const [manualDeliveryId, setManualDeliveryId] = useState('')
  const [status, setStatus] = useState<DeliveryStatus | ''>('')
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(50)

  const filters = useMemo<OperationsDeliveriesFilters>(
    () => ({
      limit,
      ...(status ? { status } : {}),
      ...(search.trim() ? { search: search.trim() } : {}),
    }),
    [limit, search, status],
  )
  const deliveriesQuery = useOperationsDeliveries(filters)
  const groupedDeliveries = useMemo(
    () => groupDeliveriesByStatus(deliveriesQuery.deliveries),
    [deliveriesQuery.deliveries],
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

  const submitManualDelivery = () => {
    const nextDeliveryId = manualDeliveryId.trim()

    if (nextDeliveryId) {
      onSelectDelivery(nextDeliveryId)
      setManualDeliveryId('')
    }
  }

  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="!m-0 !text-lg !font-semibold !tracking-normal text-slate-950">
              Live Deliveries Board
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Deliveries from the operations delivery list.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="sr-only" htmlFor="manual-delivery-id">
              Delivery ID
            </label>
            <input
              className="h-10 min-w-0 rounded-md border border-slate-300 px-3 text-sm text-slate-950 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
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
              className="h-10 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={!manualDeliveryId.trim()}
              onClick={submitManualDelivery}
              type="button"
            >
              Open
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_140px_auto]">
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-normal text-slate-500">
            Search
            <input
              className="h-10 rounded-md border border-slate-300 px-3 text-sm font-normal normal-case text-slate-950 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Delivery, customer, driver, tanker, site"
              value={search}
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-normal text-slate-500">
            Status
            <select
              className="h-10 rounded-md border border-slate-300 px-3 text-sm font-normal normal-case text-slate-950 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
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

          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-normal text-slate-500">
            Limit
            <select
              className="h-10 rounded-md border border-slate-300 px-3 text-sm font-normal normal-case text-slate-950 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
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

          <div className="flex items-end">
            <button
              className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-800 transition hover:border-cyan-600 hover:text-cyan-700 disabled:cursor-wait disabled:opacity-60 md:w-auto"
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
        <div className="py-10 text-center text-sm text-slate-600">
          Loading operations deliveries.
        </div>
      ) : null}

      {!deliveriesQuery.loading && deliveriesQuery.error ? (
        <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {deliveriesQuery.error}
        </div>
      ) : null}

      {!deliveriesQuery.loading &&
      !deliveriesQuery.error &&
      deliveriesQuery.deliveries.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-600">
          No deliveries match the current filters.
        </div>
      ) : null}

      {!deliveriesQuery.loading &&
      !deliveriesQuery.error &&
      deliveriesQuery.deliveries.length > 0 ? (
        <div className="mt-4 flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
            <span>
              Showing {deliveriesQuery.deliveries.length} delivery
              {deliveriesQuery.deliveries.length === 1 ? '' : 'ies'}
            </span>
            <span>
              Updated{' '}
              {deliveriesQuery.generatedAt
                ? formatDateTime(deliveriesQuery.generatedAt)
                : 'unknown'}
            </span>
          </div>

          {visibleStatuses.map((deliveryStatus) => (
            <div className="rounded-md border border-slate-200" key={deliveryStatus}>
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2">
                <h3 className="text-sm font-semibold text-slate-950">
                  {deliveryStatus}
                </h3>
                <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-600">
                  {groupedDeliveries[deliveryStatus].length}
                </span>
              </div>

              <div className="grid gap-3 p-3 lg:grid-cols-2">
                {groupedDeliveries[deliveryStatus].map((delivery) => {
                  const selected = selectedDeliveryId === delivery.id

                  return (
                    <button
                      className={getDeliveryCardClass(selected)}
                      key={delivery.id}
                      onClick={() => onSelectDelivery(delivery.id)}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-mono text-xs text-slate-700">
                            {delivery.id}
                          </p>
                          <p className="mt-1 truncate text-sm font-semibold text-slate-950">
                            {getPrimaryIdentifier(delivery)}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700">
                          {delivery.activeAlertsCount} alert
                          {delivery.activeAlertsCount === 1 ? '' : 's'}
                        </span>
                      </div>

                      <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                        <div className="min-w-0">
                          <p className="font-semibold uppercase tracking-normal text-slate-500">
                            Driver
                          </p>
                          <p className="truncate">
                            {delivery.identifiers.driverId ?? 'Unassigned'}
                          </p>
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold uppercase tracking-normal text-slate-500">
                            Tanker
                          </p>
                          <p className="truncate">
                            {delivery.identifiers.tankerId ?? 'Unassigned'}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 rounded-md bg-slate-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">
                          Last Event
                        </p>
                        <p className="mt-1 truncate text-sm font-semibold text-slate-950">
                          {delivery.lastEvent?.type ?? 'No event'}
                        </p>
                        <p className="mt-1 text-xs text-slate-600">
                          {delivery.lastEvent
                            ? formatDateTime(delivery.lastEvent.createdAt)
                            : 'No event recorded'}
                        </p>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-600">
                        <span>Updated {formatDateTime(delivery.updatedAt)}</span>
                        <span className="font-semibold text-cyan-700">
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
