import { useState } from 'react'
import { useDriverExecution } from '../../../hooks/useDriverExecution'
import type { DeliveryStatus } from '../../../types/delivery'
import { useDeliveryOperations } from '../hooks/useDeliveryOperations'
import { useDeliveryTimeline } from '../hooks/useDeliveryTimeline'
import DeliveryTimelinePanel from './DeliveryTimelinePanel'

type DeliveryDetailDrawerProps = {
  deliveryId: string | null
  onActionSuccess: () => void
  onClose: () => void
}

const fieldClass = 'rounded-md border border-slate-200 p-3'

const formatDateTime = (value: string | null) => {
  if (!value) {
    return 'None'
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

const formatJson = (value: unknown) => JSON.stringify(value, null, 2)

const operatorActor = {
  actorType: 'ADMIN' as const,
  actorId: 'operations-control-room',
}

const failStatuses: DeliveryStatus[] = [
  'LOADING',
  'EN_ROUTE',
  'ARRIVED',
  'MEASURING',
  'AWAITING_OTP',
]

const skipStatuses: DeliveryStatus[] = [
  'ASSIGNED',
  'LOADING',
  'EN_ROUTE',
  'ARRIVED',
]

const getAlertKey = (
  alert:
    | NonNullable<ReturnType<typeof useDeliveryOperations>['data']>['alerts']['unresolved'][number]
    | NonNullable<ReturnType<typeof useDeliveryOperations>['data']>['alerts']['candidates'][number],
) => {
  if ('createdAt' in alert) {
    return `${alert.type}-${alert.createdAt}`
  }

  return `${alert.type}-${alert.ageMinutes}`
}

export default function DeliveryDetailDrawer({
  deliveryId,
  onActionSuccess,
  onClose,
}: DeliveryDetailDrawerProps) {
  const [otpCode, setOtpCode] = useState('')
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const operations = useDeliveryOperations(deliveryId)
  const timeline = useDeliveryTimeline(deliveryId)
  const driverExecution = useDriverExecution()
  const data = operations.data
  const activeAlerts = data
    ? [...data.alerts.unresolved, ...data.alerts.candidates]
    : []
  const busy = operations.loading || timeline.loading || driverExecution.loading

  if (!deliveryId) {
    return null
  }

  const refresh = async () => {
    await Promise.all([operations.refetch(), timeline.refetch()])
  }

  const refreshAfterAction = async () => {
    await refresh()
    onActionSuccess()
  }

  const runAction = async (
    action: () => ReturnType<typeof driverExecution.failDelivery>,
    successMessage: string,
  ) => {
    setActionMessage(null)
    setActionError(null)

    const response = await action()

    if (!response.success) {
      setActionError(response.error)
      return
    }

    setActionMessage(successMessage)
    setOtpCode('')
    await refreshAfterAction()
  }

  const confirmDangerousAction = (label: string) =>
    window.confirm(`Confirm ${label} for delivery ${deliveryId}?`)

  const canFail = data ? failStatuses.includes(data.delivery.status) : false
  const canSkip = data ? skipStatuses.includes(data.delivery.status) : false
  const canConfirmOtp =
    data?.delivery.status === 'AWAITING_OTP' && otpCode.trim().length > 0
  const canComplete =
    data?.delivery.status === 'AWAITING_OTP' &&
    data.otp.state === 'VERIFIED' &&
    Boolean(data.delivery.customerId)

  const handleFail = () => {
    if (!deliveryId || !confirmDangerousAction('failure')) {
      return
    }

    void runAction(
      () =>
        driverExecution.failDelivery(deliveryId, {
          ...operatorActor,
          reason: 'Marked failed from operations control room',
          metadata: { source: 'operations_dashboard' },
        }),
      'Delivery failure recorded.',
    )
  }

  const handleSkip = () => {
    if (!deliveryId || !confirmDangerousAction('skip')) {
      return
    }

    void runAction(
      () =>
        driverExecution.skipDelivery(deliveryId, {
          ...operatorActor,
          reason: 'Marked skipped from operations control room',
          metadata: { source: 'operations_dashboard' },
        }),
      'Delivery skip recorded.',
    )
  }

  const handleConfirmOtp = () => {
    if (!deliveryId) {
      return
    }

    void runAction(
      () =>
        driverExecution.confirmOtp(deliveryId, {
          actorType: 'CUSTOMER',
          actorId: data?.delivery.customerId ?? 'operations-control-room',
          otpCode: otpCode.trim(),
        }),
      'Delivery OTP confirmed.',
    )
  }

  const handleComplete = () => {
    const customerId = data?.delivery.customerId

    if (
      !deliveryId ||
      !customerId ||
      !confirmDangerousAction('completion')
    ) {
      return
    }

    void runAction(
      () =>
        driverExecution.completeDelivery(deliveryId, {
          actorType: 'CUSTOMER',
          actorId: customerId,
        }),
      'Delivery completed.',
    )
  }

  return (
    <aside className="fixed inset-y-0 right-0 z-20 flex w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-2xl">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">
            Delivery Detail
          </p>
          <h2 className="!m-0 mt-1 truncate !text-lg !font-semibold !tracking-normal text-slate-950">
            {deliveryId}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="h-9 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-800 transition hover:border-cyan-600 hover:text-cyan-700"
            disabled={busy}
            onClick={refresh}
            type="button"
          >
            {busy ? 'Working' : 'Refresh'}
          </button>
          <button
            className="h-9 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {operations.loading ? (
          <div className="rounded-md border border-slate-200 p-4 text-sm text-slate-600">
            Loading delivery operations.
          </div>
        ) : null}

        {!operations.loading && operations.error ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {operations.error}
          </div>
        ) : null}

        {!operations.loading && !operations.error && !data ? (
          <div className="rounded-md border border-slate-200 p-4 text-sm text-slate-600">
            No delivery detail found.
          </div>
        ) : null}

        {!operations.loading && !operations.error && data ? (
          <div className="flex flex-col gap-5">
            <section className="grid gap-3 sm:grid-cols-2">
              <div className={fieldClass}>
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">
                  Status
                </p>
                <p className="mt-1 text-base font-semibold text-slate-950">
                  {data.delivery.status}
                </p>
              </div>
              <div className={fieldClass}>
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">
                  Age
                </p>
                <p className="mt-1 text-base font-semibold text-slate-950">
                  {data.currentStatusAge.ageMinutes} min
                </p>
              </div>
              <div className={fieldClass}>
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">
                  OTP
                </p>
                <p className="mt-1 text-base font-semibold text-slate-950">
                  {data.otp.state}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  Attempts: {data.otp.attemptCount}
                </p>
              </div>
              <div className={fieldClass}>
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">
                  Generated
                </p>
                <p className="mt-1 text-sm font-medium text-slate-950">
                  {formatDateTime(data.generatedAt)}
                </p>
              </div>
            </section>

            <section className="rounded-md border border-slate-200 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-normal text-slate-500">
                Operator Action
              </h3>
              <p className="mt-2 text-sm text-slate-800">
                {data.suggestedOperatorAction}
              </p>
            </section>

            <section className="rounded-md border border-slate-200 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-normal text-slate-500">
                Actions
              </h3>

              {actionMessage ? (
                <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  {actionMessage}
                </div>
              ) : null}

              {actionError ? (
                <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                  {actionError}
                </div>
              ) : null}

              <div className="mt-3 flex flex-col gap-3">
                {data.delivery.status === 'AWAITING_OTP' ? (
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-normal text-slate-500">
                      OTP
                      <input
                        className="h-10 rounded-md border border-slate-300 px-3 text-sm font-normal normal-case text-slate-950 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
                        inputMode="numeric"
                        onChange={(event) => setOtpCode(event.target.value)}
                        placeholder="Enter customer OTP"
                        value={otpCode}
                      />
                    </label>
                    <div className="flex items-end">
                      <button
                        className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-800 transition hover:border-cyan-600 hover:text-cyan-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                        disabled={busy || !canConfirmOtp}
                        onClick={handleConfirmOtp}
                        type="button"
                      >
                        Confirm OTP
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  {canFail ? (
                    <button
                      className="rounded-md border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:border-rose-500 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={busy}
                      onClick={handleFail}
                      type="button"
                    >
                      Fail Delivery
                    </button>
                  ) : null}

                  {canSkip ? (
                    <button
                      className="rounded-md border border-amber-300 px-3 py-2 text-sm font-semibold text-amber-800 transition hover:border-amber-500 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={busy}
                      onClick={handleSkip}
                      type="button"
                    >
                      Skip Delivery
                    </button>
                  ) : null}

                  {data.delivery.status === 'AWAITING_OTP' ? (
                    <button
                      className="rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                      disabled={busy || !canComplete}
                      onClick={handleComplete}
                      title={
                        canComplete
                          ? undefined
                          : 'Completion requires verified OTP and a customer identifier.'
                      }
                      type="button"
                    >
                      Complete Delivery
                    </button>
                  ) : null}

                  {!canFail &&
                  !canSkip &&
                  data.delivery.status !== 'AWAITING_OTP' ? (
                    <p className="text-sm text-slate-600">
                      No operator actions are available for this status.
                    </p>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="grid gap-3 text-sm sm:grid-cols-2">
              <div className={fieldClass}>
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">
                  Driver
                </p>
                <p className="mt-1 break-words font-mono text-xs text-slate-800">
                  {data.delivery.driverId ?? 'Unassigned'}
                </p>
              </div>
              <div className={fieldClass}>
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">
                  Tanker
                </p>
                <p className="mt-1 break-words font-mono text-xs text-slate-800">
                  {data.delivery.tankerId ?? 'Unassigned'}
                </p>
              </div>
              <div className={fieldClass}>
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">
                  Customer
                </p>
                <p className="mt-1 break-words font-mono text-xs text-slate-800">
                  {data.delivery.customerId ?? 'Unknown'}
                </p>
              </div>
              <div className={fieldClass}>
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">
                  Site
                </p>
                <p className="mt-1 break-words font-mono text-xs text-slate-800">
                  {data.delivery.siteId ?? 'Unknown'}
                </p>
              </div>
            </section>

            <section className="rounded-md border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold uppercase tracking-normal text-slate-500">
                  Active Alerts
                </h3>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                  {activeAlerts.length}
                </span>
              </div>
              {activeAlerts.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">
                  No active alerts for this delivery.
                </p>
              ) : (
                <div className="mt-3 flex flex-col gap-2">
                  {activeAlerts.map((alert) => (
                    <div
                      className="rounded-md bg-slate-50 p-3"
                      key={getAlertKey(alert)}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700">
                          {alert.severity}
                        </span>
                        <span className="text-xs font-semibold text-slate-500">
                          {alert.type}
                        </span>
                      </div>
                      {'message' in alert ? (
                        <p className="mt-2 text-sm text-slate-800">
                          {alert.message}
                        </p>
                      ) : null}
                      {'createdAt' in alert ? (
                        <p className="mt-2 text-xs text-slate-600">
                          Created {formatDateTime(alert.createdAt)}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-md border border-slate-200 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-normal text-slate-500">
                Latest Event
              </h3>
              {data.latestEvent ? (
                <div className="mt-3 rounded-md bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-700">
                      {data.latestEvent.type}
                    </span>
                    <span className="text-xs text-slate-500">
                      {formatDateTime(data.latestEvent.createdAt)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-600">
                    Actor: {data.latestEvent.actorType} /{' '}
                    {data.latestEvent.actorId ?? 'none'}
                  </p>
                  <pre className="mt-3 max-h-44 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-50">
                    {formatJson(data.latestEvent.metadata)}
                  </pre>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-600">
                  No latest event recorded.
                </p>
              )}
            </section>

            <section className="rounded-md border border-slate-200 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-normal text-slate-500">
                Risk Flags
              </h3>
              {data.riskFlags.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">
                  No risk flags currently detected.
                </p>
              ) : (
                <div className="mt-3 flex flex-col gap-2">
                  {data.riskFlags.map((flag) => (
                    <div
                      className="rounded-md bg-slate-50 p-3"
                      key={`${flag.type}-${flag.message}`}
                    >
                      <p className="text-xs font-semibold text-slate-500">
                        {flag.severity} / {flag.type}
                      </p>
                      <p className="mt-1 text-sm text-slate-800">
                        {flag.message}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <DeliveryTimelinePanel
              error={timeline.error}
              loading={timeline.loading}
              timeline={timeline.data}
            />
          </div>
        ) : null}
      </div>
    </aside>
  )
}
