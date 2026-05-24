import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import type { DeliveryStatus } from '../../types/delivery'
import { useTheme } from '../operations/hooks/useTheme'

type TimelineStep = {
  status: DeliveryStatus
  label: string
}

type MockClientDelivery = {
  id: string
  customerId: string
  siteLabel: string
  volumeLitres: number
  status: DeliveryStatus
  tankerId: string | null
  driverId: string | null
  otpCode: string | null
  otpExpiresAt: string | null
}

const deliverySteps: TimelineStep[] = [
  { status: 'CREATED', label: 'Request received' },
  { status: 'ASSIGNED', label: 'Tanker assigned' },
  { status: 'LOADING', label: 'Tanker loading' },
  { status: 'EN_ROUTE', label: 'On the way' },
  { status: 'ARRIVED', label: 'Arrived at site' },
  { status: 'MEASURING', label: 'Measuring water' },
  { status: 'AWAITING_OTP', label: 'Confirm OTP' },
  { status: 'COMPLETED', label: 'Completed' },
]

const terminalStatuses: DeliveryStatus[] = ['FAILED', 'SKIPPED']

const mockDelivery: MockClientDelivery = {
  id: 'demo-client-delivery-001',
  customerId: 'demo-customer-assignment-ready',
  siteLabel: 'Lekki Phase 1 Residence',
  volumeLitres: 12_000,
  status: 'AWAITING_OTP',
  tankerId: 'seed-delivery-scenario:tanker:assignment-ready-available',
  driverId: 'seed-delivery-scenario:driver:assignment-ready-available',
  otpCode: '482913',
  otpExpiresAt: new Date(Date.now() + 8 * 60_000).toISOString(),
}

const formatDateTime = (value: string | null) => {
  if (!value) {
    return 'Not available'
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

const getStepState = (step: DeliveryStatus, current: DeliveryStatus) => {
  if (terminalStatuses.includes(current)) {
    return 'upcoming'
  }

  const currentIndex = deliverySteps.findIndex((item) => item.status === current)
  const stepIndex = deliverySteps.findIndex((item) => item.status === step)

  if (stepIndex < currentIndex) {
    return 'done'
  }

  if (stepIndex === currentIndex) {
    return 'current'
  }

  return 'upcoming'
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  [
    'rounded-md px-3 py-2 text-sm font-semibold transition',
    isActive
      ? 'bg-cyan-600 text-white dark:bg-cyan-400 dark:text-slate-950'
      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800',
  ].join(' ')

function StatusTimeline({ delivery }: { delivery: MockClientDelivery }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="!m-0 !text-lg !font-semibold !tracking-normal text-slate-950 dark:text-slate-50">
        Delivery Timeline
      </h2>
      <div className="mt-4 flex flex-col gap-3">
        {deliverySteps.map((step) => {
          const state = getStepState(step.status, delivery.status)

          return (
            <div className="grid grid-cols-[24px_minmax(0,1fr)] gap-3" key={step.status}>
              <span
                className={[
                  'mt-0.5 h-5 w-5 rounded-full border',
                  state === 'done'
                    ? 'border-emerald-600 bg-emerald-500'
                    : state === 'current'
                      ? 'border-cyan-600 bg-cyan-500'
                      : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-950',
                ].join(' ')}
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">
                  {step.label}
                </p>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  {step.status}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function OtpDisplay({ delivery }: { delivery: MockClientDelivery }) {
  return (
    <section className="rounded-md border border-cyan-200 bg-cyan-50 p-4 dark:border-cyan-800 dark:bg-cyan-950/30">
      <p className="text-xs font-semibold uppercase tracking-normal text-cyan-800 dark:text-cyan-200">
        Delivery OTP
      </p>
      {delivery.status === 'AWAITING_OTP' && delivery.otpCode ? (
        <>
          <p className="mt-2 font-mono text-3xl font-semibold tracking-normal text-cyan-950 dark:text-cyan-50">
            {delivery.otpCode}
          </p>
          <p className="mt-2 text-sm text-cyan-900 dark:text-cyan-100">
            Share this code with the driver after water measurement is confirmed.
          </p>
          <p className="mt-1 text-xs text-cyan-800 dark:text-cyan-200">
            Expires {formatDateTime(delivery.otpExpiresAt)}
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-cyan-900 dark:text-cyan-100">
          OTP appears when the delivery is awaiting customer confirmation.
        </p>
      )}
    </section>
  )
}

function RequestWaterPage() {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h1 className="!m-0 !text-2xl !font-semibold !tracking-normal text-slate-950 dark:text-slate-50">
          Request Water
        </h1>
        <div className="mt-5 grid gap-4">
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
            Delivery address
            <input
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal normal-case text-slate-950 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              defaultValue="Lekki Phase 1 Residence"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
            Water volume
            <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal normal-case text-slate-950 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
              <option>12,000 litres</option>
              <option>18,000 litres</option>
              <option>24,000 litres</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
            Site note
            <textarea
              className="min-h-24 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case text-slate-950 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              defaultValue="Gate code available. Tank is behind the main building."
            />
          </label>
          <button
            className="h-10 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white opacity-60 disabled:cursor-not-allowed dark:bg-cyan-500 dark:text-slate-950"
            disabled
            type="button"
          >
            Submit request
          </button>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
          Demo Mode
        </p>
        <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
          Request creation is mocked until the customer request API is available.
        </p>
        <Link
          className="mt-4 inline-flex rounded-md border border-cyan-300 px-3 py-2 text-sm font-semibold text-cyan-800 hover:bg-cyan-50 dark:border-cyan-800 dark:text-cyan-100 dark:hover:bg-cyan-950/40"
          to="/client/track"
        >
          View mock tracking
        </Link>
      </section>
    </div>
  )
}

function DeliveryTrackingPage() {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-5">
        <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
            Delivery Tracking
          </p>
          <h1 className="!m-0 mt-1 !text-2xl !font-semibold !tracking-normal text-slate-950 dark:text-slate-50">
            {mockDelivery.id}
          </h1>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
              <p className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                Status
              </p>
              <p className="mt-1 font-semibold text-slate-950 dark:text-slate-50">
                {mockDelivery.status}
              </p>
            </div>
            <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
              <p className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                Site
              </p>
              <p className="mt-1 font-semibold text-slate-950 dark:text-slate-50">
                {mockDelivery.siteLabel}
              </p>
            </div>
            <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
              <p className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                Driver
              </p>
              <p className="mt-1 truncate font-mono text-xs text-slate-700 dark:text-slate-200">
                {mockDelivery.driverId ?? 'Pending assignment'}
              </p>
            </div>
            <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
              <p className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                Tanker
              </p>
              <p className="mt-1 truncate font-mono text-xs text-slate-700 dark:text-slate-200">
                {mockDelivery.tankerId ?? 'Pending assignment'}
              </p>
            </div>
          </div>
        </section>

        <StatusTimeline delivery={mockDelivery} />
      </div>

      <OtpDisplay delivery={mockDelivery} />
    </div>
  )
}

export default function ClientPortal() {
  const { theme, toggleTheme } = useTheme()

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-5 text-left text-slate-950 transition-colors dark:bg-slate-950 dark:text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
              Customer Portal
            </p>
            <h1 className="!m-0 mt-1 !text-2xl !font-semibold !tracking-normal text-slate-950 dark:text-slate-50 sm:!text-3xl">
              TankUp Water Delivery
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <nav className="flex rounded-md border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
              <NavLink className={navClass} to="/client/request">
                Request
              </NavLink>
              <NavLink className={navClass} to="/client/track">
                Track
              </NavLink>
            </nav>
            <Link
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:border-cyan-600 hover:text-cyan-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              to="/operations"
            >
              Operations
            </Link>
            <button
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:border-cyan-600 hover:text-cyan-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              onClick={toggleTheme}
              type="button"
            >
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
          </div>
        </header>

        <Routes>
          <Route element={<RequestWaterPage />} path="request" />
          <Route element={<DeliveryTrackingPage />} path="track" />
          <Route element={<Navigate replace to="request" />} path="*" />
        </Routes>
      </div>
    </main>
  )
}
