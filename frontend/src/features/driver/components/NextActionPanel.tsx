import type { DeliveryStatus } from '../../../types/delivery'

type NextAction = {
  label: string
  status: DeliveryStatus
  run: () => void
}

type NextActionPanelProps = {
  busy: boolean
  canRun: boolean
  currentStatus: DeliveryStatus | null
  onArrive: () => void
  onRequestOtp: () => void
  onStartLoading: () => void
  onStartMeasuring: () => void
  onStartRoute: () => void
}

const getNextLabel = (status: DeliveryStatus | null) => {
  switch (status) {
    case 'ASSIGNED':
      return 'Start loading'
    case 'LOADING':
      return 'Start route'
    case 'EN_ROUTE':
      return 'Confirm arrival'
    case 'ARRIVED':
      return 'Start measuring'
    case 'MEASURING':
      return 'Request OTP'
    case 'AWAITING_OTP':
      return 'Confirm OTP'
    case 'COMPLETED':
      return 'Delivery complete'
    case 'FAILED':
    case 'SKIPPED':
      return 'Terminal status'
    default:
      return 'Set delivery ID and begin from assigned status'
  }
}

export default function NextActionPanel({
  busy,
  canRun,
  currentStatus,
  onArrive,
  onRequestOtp,
  onStartLoading,
  onStartMeasuring,
  onStartRoute,
}: NextActionPanelProps) {
  const actions: NextAction[] = [
    { label: 'Start Loading', status: 'ASSIGNED', run: onStartLoading },
    { label: 'Start Route', status: 'LOADING', run: onStartRoute },
    { label: 'Arrive', status: 'EN_ROUTE', run: onArrive },
    {
      label: 'Start Measuring',
      status: 'ARRIVED',
      run: onStartMeasuring,
    },
    { label: 'Request OTP', status: 'MEASURING', run: onRequestOtp },
  ]

  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-1 border-b border-slate-200 pb-4">
        <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">
          Next Action
        </p>
        <h2 className="!m-0 !text-lg !font-semibold !tracking-normal text-slate-950">
          {getNextLabel(currentStatus)}
        </h2>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {actions.map((action) => {
          const isCurrentAction = currentStatus === action.status

          return (
            <button
              className={[
                'h-10 rounded-md px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
                isCurrentAction
                  ? 'bg-slate-950 text-white hover:bg-slate-800'
                  : 'border border-slate-300 text-slate-800 hover:border-cyan-600 hover:text-cyan-700',
              ].join(' ')}
              disabled={!canRun || busy || !isCurrentAction}
              key={action.label}
              onClick={action.run}
              type="button"
            >
              {action.label}
            </button>
          )
        })}
      </div>
    </section>
  )
}
