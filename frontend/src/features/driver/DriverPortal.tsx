import { useMemo, useState } from 'react'
import { useDriverExecution } from '../../hooks/useDriverExecution'
import type {
  ApiError,
  ApiSuccess,
  DriverExecutionMetadata,
  DriverExecutionResponse,
} from '../../types/delivery'
import AssignedDeliveryCard from './components/AssignedDeliveryCard'
import MeasurementSection from './components/MeasurementSection'
import NextActionPanel from './components/NextActionPanel'
import OtpConfirmationSection from './components/OtpConfirmationSection'

type DriverExecutionSuccess = ApiSuccess<DriverExecutionMetadata | null>

const toMeasuredVolume = (value: string) => {
  const measuredVolumeLiters = Number(value)

  return Number.isFinite(measuredVolumeLiters) ? measuredVolumeLiters : 0
}

export default function DriverPortal() {
  const [deliveryId, setDeliveryId] = useState('')
  const [actorId, setActorId] = useState('driver-dev-001')
  const [otpCode, setOtpCode] = useState('')
  const [measuredVolumeLiters, setMeasuredVolumeLiters] = useState('12000')
  const [measurementNote, setMeasurementNote] = useState('')
  const [lastSuccess, setLastSuccess] = useState<DriverExecutionSuccess | null>(
    null,
  )
  const [lastError, setLastError] = useState<ApiError | null>(null)
  const driverExecution = useDriverExecution()

  const normalizedDeliveryId = deliveryId.trim()
  const normalizedActorId = actorId.trim()
  const currentStatus = lastSuccess?.delivery.status ?? null
  const canRun = Boolean(normalizedDeliveryId && normalizedActorId)
  const driverPayload = useMemo(
    () => ({
      actorType: 'DRIVER' as const,
      actorId: normalizedActorId || undefined,
    }),
    [normalizedActorId],
  )

  const handleResponse = (response: DriverExecutionResponse) => {
    if (!response.success) {
      setLastError(response)
      return
    }

    setLastSuccess(response)
    setLastError(null)
  }

  const runAction = async (action: () => Promise<DriverExecutionResponse>) => {
    const response = await action()
    handleResponse(response)
  }

  const runDriverAction = (
    action: (
      deliveryId: string,
      payload: typeof driverPayload,
    ) => Promise<DriverExecutionResponse>,
  ) => {
    if (!canRun) {
      return
    }

    void runAction(() => action(normalizedDeliveryId, driverPayload))
  }

  const submitMeasurement = () => {
    if (!canRun) {
      return
    }

    void runAction(() =>
      driverExecution.submitMeasurement(normalizedDeliveryId, {
        ...driverPayload,
        measurement: {
          measuredVolumeLiters: toMeasuredVolume(measuredVolumeLiters),
          measurementNote: measurementNote.trim() || null,
        },
        metadata: {
          source: 'driver_portal',
        },
      }),
    )
  }

  const confirmOtp = () => {
    if (!canRun || !otpCode.trim()) {
      return
    }

    void runAction(() =>
      driverExecution.confirmOtp(normalizedDeliveryId, {
        ...driverPayload,
        otpCode: otpCode.trim(),
      }),
    )
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-5 text-left text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="flex flex-col gap-2 border-b border-slate-200 pb-4">
          <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">
            Driver Portal
          </p>
          <h1 className="!m-0 !text-2xl !font-semibold !tracking-normal text-slate-950 sm:!text-3xl">
            Delivery Execution
          </h1>
        </header>

        <AssignedDeliveryCard
          actorId={actorId}
          deliveryId={deliveryId}
          onActorIdChange={setActorId}
          onDeliveryIdChange={setDeliveryId}
          status={currentStatus}
        />

        <NextActionPanel
          busy={driverExecution.loading}
          canRun={canRun}
          currentStatus={currentStatus}
          onArrive={() => runDriverAction(driverExecution.arrive)}
          onRequestOtp={() => runDriverAction(driverExecution.requestOtp)}
          onStartLoading={() => runDriverAction(driverExecution.startLoading)}
          onStartMeasuring={() =>
            runDriverAction(driverExecution.startMeasuring)
          }
          onStartRoute={() => runDriverAction(driverExecution.startRoute)}
        />

        <div className="grid gap-5 lg:grid-cols-2">
          <MeasurementSection
            busy={driverExecution.loading}
            canSubmit={canRun && currentStatus === 'MEASURING'}
            measuredVolumeLiters={measuredVolumeLiters}
            measurementNote={measurementNote}
            onMeasuredVolumeLitersChange={setMeasuredVolumeLiters}
            onMeasurementNoteChange={setMeasurementNote}
            onSubmitMeasurement={submitMeasurement}
          />

          <OtpConfirmationSection
            busy={driverExecution.loading}
            canConfirm={
              canRun && currentStatus === 'AWAITING_OTP' && Boolean(otpCode.trim())
            }
            onConfirmOtp={confirmOtp}
            onOtpCodeChange={setOtpCode}
            otpCode={otpCode}
          />
        </div>

        <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-slate-300 px-3 py-1 text-sm font-semibold text-slate-700">
              Loading: {driverExecution.loading ? 'yes' : 'no'}
            </span>
            {currentStatus ? (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800">
                Status: {currentStatus}
              </span>
            ) : null}
          </div>

          {lastSuccess ? (
            <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              {lastSuccess.message}
            </div>
          ) : null}

          {(lastError ?? driverExecution.error) ? (
            <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              {(lastError ?? driverExecution.error)?.error}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  )
}
