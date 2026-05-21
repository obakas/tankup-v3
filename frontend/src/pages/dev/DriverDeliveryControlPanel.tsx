import { useState } from 'react'
import { useDriverExecution } from '../../hooks/useDriverExecution'
import type {
  ApiError,
  ApiSuccess,
  DriverExecutionMetadata,
  DriverExecutionResponse,
} from '../../types/delivery'

type DriverExecutionSuccess = ApiSuccess<DriverExecutionMetadata | null>

type DriverAction = {
  label: string
  run: () => Promise<DriverExecutionResponse>
}

const formatJson = (value: unknown) => JSON.stringify(value, null, 2)

const toMeasuredVolume = (value: string) => {
  const measuredVolumeLiters = Number(value)

  return Number.isFinite(measuredVolumeLiters) ? measuredVolumeLiters : 0
}

export default function DriverDeliveryControlPanel() {
  const [deliveryId, setDeliveryId] = useState('')
  const [actorId, setActorId] = useState('driver-dev-001')
  const [otpCode, setOtpCode] = useState('')
  const [measuredVolumeLiters, setMeasuredVolumeLiters] = useState('12000')
  const [measurementNote, setMeasurementNote] = useState('Dev panel measurement')
  const [lastSuccess, setLastSuccess] = useState<DriverExecutionSuccess | null>(
    null,
  )
  const [lastError, setLastError] = useState<ApiError | null>(null)

  const driverExecution = useDriverExecution()

  const basePayload = { actorId: actorId.trim() || undefined }
  const normalizedDeliveryId = deliveryId.trim()

  const handleAction = async (action: DriverAction) => {
    const response = await action.run()

    if (response.success) {
      setLastSuccess(response)
      return
    }

    setLastError(response)
  }

  const actions: DriverAction[] = [
    {
      label: 'Start Loading',
      run: () =>
        driverExecution.startLoading(normalizedDeliveryId, basePayload),
    },
    {
      label: 'Start Route',
      run: () => driverExecution.startRoute(normalizedDeliveryId, basePayload),
    },
    {
      label: 'Arrive',
      run: () => driverExecution.arrive(normalizedDeliveryId, basePayload),
    },
    {
      label: 'Start Measuring',
      run: () =>
        driverExecution.startMeasuring(normalizedDeliveryId, basePayload),
    },
    {
      label: 'Submit Measurement',
      run: () =>
        driverExecution.submitMeasurement(normalizedDeliveryId, {
          ...basePayload,
          measurement: {
            measuredVolumeLiters: toMeasuredVolume(measuredVolumeLiters),
            measurementNote,
          },
        }),
    },
    {
      label: 'Request OTP',
      run: () => driverExecution.requestOtp(normalizedDeliveryId, basePayload),
    },
    {
      label: 'Confirm OTP',
      run: () =>
        driverExecution.confirmOtp(normalizedDeliveryId, {
          ...basePayload,
          otpCode: otpCode.trim(),
        }),
    },
    {
      label: 'Complete Delivery',
      run: () =>
        driverExecution.completeDelivery(normalizedDeliveryId, basePayload),
    },
    {
      label: 'Fail Delivery',
      run: () =>
        driverExecution.failDelivery(normalizedDeliveryId, {
          ...basePayload,
          reason: 'Marked failed from dev driver control panel',
        }),
    },
    {
      label: 'Skip Delivery',
      run: () =>
        driverExecution.skipDelivery(normalizedDeliveryId, {
          ...basePayload,
          reason: 'Marked skipped from dev driver control panel',
        }),
    },
  ]

  const latestEvent = lastSuccess?.event ?? null
  const currentStatus = lastSuccess?.delivery.status ?? null

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-left text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="border-b border-slate-200 pb-4">
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
            Dev tools
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">
            Driver Delivery Control Panel
          </h1>
        </header>

        <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Delivery ID
            <input
              className="rounded-md border border-slate-300 px-3 py-2 text-base text-slate-950 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              value={deliveryId}
              onChange={(event) => setDeliveryId(event.target.value)}
              placeholder="delivery-id"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Actor ID
            <input
              className="rounded-md border border-slate-300 px-3 py-2 text-base text-slate-950 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              value={actorId}
              onChange={(event) => setActorId(event.target.value)}
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            OTP
            <input
              className="rounded-md border border-slate-300 px-3 py-2 text-base text-slate-950 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              value={otpCode}
              onChange={(event) => setOtpCode(event.target.value)}
              placeholder="123456"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
              Measured Volume Liters
              <input
                className="rounded-md border border-slate-300 px-3 py-2 text-base text-slate-950 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                inputMode="numeric"
                value={measuredVolumeLiters}
                onChange={(event) => setMeasuredVolumeLiters(event.target.value)}
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
              Measurement Note
              <input
                className="rounded-md border border-slate-300 px-3 py-2 text-base text-slate-950 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                value={measurementNote}
                onChange={(event) => setMeasurementNote(event.target.value)}
              />
            </label>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
              Loading: {driverExecution.loading ? 'yes' : 'no'}
            </span>
            {currentStatus ? (
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
                Status: {currentStatus}
              </span>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {actions.map((action) => (
              <button
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:border-sky-400 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!normalizedDeliveryId || driverExecution.loading}
                key={action.label}
                onClick={() => void handleAction(action)}
                type="button"
              >
                {action.label}
              </button>
            ))}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold text-slate-950">
              Last Success Response
            </h2>
            <pre className="max-h-96 overflow-auto rounded-md bg-slate-950 p-3 text-sm text-slate-50">
              {lastSuccess ? formatJson(lastSuccess) : 'No success response yet.'}
            </pre>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold text-slate-950">
              Last Error Response
            </h2>
            <pre className="max-h-96 overflow-auto rounded-md bg-slate-950 p-3 text-sm text-slate-50">
              {lastError ?? driverExecution.error
                ? formatJson(lastError ?? driverExecution.error)
                : 'No error response yet.'}
            </pre>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-slate-950">
            Latest Event
          </h2>
          <pre className="max-h-96 overflow-auto rounded-md bg-slate-950 p-3 text-sm text-slate-50">
            {latestEvent ? formatJson(latestEvent) : 'No event yet.'}
          </pre>
        </section>
      </div>
    </main>
  )
}
