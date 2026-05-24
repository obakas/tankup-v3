type TankerAvailability =
  | 'AVAILABLE'
  | 'ON_DELIVERY'
  | 'MAINTENANCE'
  | 'OFFLINE'

type Tanker = {
  id: string
  plateNumber: string
  capacityLiters: number
  driverName: string
  availability: TankerAvailability
  location: string
  activeDelivery?: {
    deliveryId: string
    customer: string
    status: string
    destination: string
  } | null
}

type SummaryCard = {
  label: string
  value: string
  detail: string
}

const mockTankers: Tanker[] = [
  {
    id: 'tnk-001',
    plateNumber: 'LAG-482-XK',
    capacityLiters: 12000,
    driverName: 'Musa Adewale',
    availability: 'AVAILABLE',
    location: 'Lekki depot',
    activeDelivery: null,
  },
  {
    id: 'tnk-002',
    plateNumber: 'ABJ-204-RT',
    capacityLiters: 10000,
    driverName: 'Grace Okon',
    availability: 'ON_DELIVERY',
    location: 'Victoria Island',
    activeDelivery: {
      deliveryId: 'mock-delivery-204',
      customer: 'Azure Court Estate',
      status: 'EN_ROUTE',
      destination: 'Oniru, Lagos',
    },
  },
  {
    id: 'tnk-003',
    plateNumber: 'LAG-771-QP',
    capacityLiters: 15000,
    driverName: 'Ibrahim Sani',
    availability: 'MAINTENANCE',
    location: 'Workshop bay 2',
    activeDelivery: null,
  },
  {
    id: 'tnk-004',
    plateNumber: 'OGN-118-LA',
    capacityLiters: 8000,
    driverName: 'Unassigned',
    availability: 'OFFLINE',
    location: 'Last seen: Ajah',
    activeDelivery: null,
  },
]

const dailySummaryCards: SummaryCard[] = [
  {
    label: 'Deliveries Today',
    value: '6',
    detail: 'mock total across fleet',
  },
  {
    label: 'Water Moved',
    value: '58k L',
    detail: 'mock delivered volume',
  },
  {
    label: 'Available Tankers',
    value: String(
      mockTankers.filter((tanker) => tanker.availability === 'AVAILABLE')
        .length,
    ),
    detail: 'ready for assignment',
  },
  {
    label: 'Open Exceptions',
    value: '2',
    detail: 'mock alerts pending review',
  },
]

const availabilityStyles: Record<TankerAvailability, string> = {
  AVAILABLE:
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300',
  ON_DELIVERY:
    'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-300',
  MAINTENANCE:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300',
  OFFLINE:
    'border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
}

const availabilityLabels: Record<TankerAvailability, string> = {
  AVAILABLE: 'Available',
  ON_DELIVERY: 'On delivery',
  MAINTENANCE: 'Maintenance',
  OFFLINE: 'Offline',
}

const formatLiters = (liters: number) =>
  new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(liters)

export default function FleetOwnerDashboard() {
  const activeDeliveryTanker = mockTankers.find(
    (tanker) => tanker.activeDelivery,
  )

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-5 text-left text-slate-950 transition-colors dark:bg-slate-950 dark:text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
              Fleet owner
            </p>
            <h1 className="!m-0 mt-1 !text-2xl !font-semibold !tracking-normal text-slate-950 dark:text-slate-50 sm:!text-3xl">
              Tanker Dashboard
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <span className="rounded-full border border-dashed border-slate-300 bg-white px-3 py-1 font-medium dark:border-slate-700 dark:bg-slate-900">
              Mock data
            </span>
            <span className="rounded-full border border-slate-300 bg-white px-3 py-1 dark:border-slate-700 dark:bg-slate-900">
              No backend calls
            </span>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {dailySummaryCards.map((card) => (
            <article
              className="rounded-md border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              key={card.label}
            >
              <p className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                {card.label}
              </p>
              <p className="mt-2 break-words text-2xl font-semibold leading-tight text-slate-950 dark:text-slate-50">
                {card.value}
              </p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {card.detail}
              </p>
            </article>
          ))}
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-2 border-b border-slate-200 pb-4 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="!m-0 !text-lg !font-semibold !tracking-normal text-slate-950 dark:text-slate-50">
                  Tankers
                </h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  Mock list until fleet APIs are connected.
                </p>
              </div>
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {mockTankers.length} tankers shown
              </span>
            </div>

            <div className="mt-4 overflow-hidden rounded-md border border-slate-200 dark:border-slate-800">
              <div className="hidden grid-cols-[1.1fr_0.9fr_0.8fr_1fr] gap-3 bg-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-normal text-slate-500 dark:bg-slate-800 dark:text-slate-300 md:grid">
                <span>Tanker</span>
                <span>Availability</span>
                <span>Capacity</span>
                <span>Driver / Location</span>
              </div>

              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {mockTankers.map((tanker) => (
                  <article
                    className="grid gap-3 px-4 py-4 text-sm text-slate-700 dark:text-slate-300 md:grid-cols-[1.1fr_0.9fr_0.8fr_1fr]"
                    key={tanker.id}
                  >
                    <div>
                      <p className="font-semibold text-slate-950 dark:text-slate-50">
                        {tanker.plateNumber}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {tanker.id}
                      </p>
                    </div>

                    <div>
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${availabilityStyles[tanker.availability]}`}
                      >
                        {availabilityLabels[tanker.availability]}
                      </span>
                    </div>

                    <p>{formatLiters(tanker.capacityLiters)} L</p>

                    <div>
                      <p className="font-medium text-slate-800 dark:text-slate-200">
                        {tanker.driverName}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {tanker.location}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>

          <aside className="flex flex-col gap-5">
            <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                Active delivery
              </p>
              {activeDeliveryTanker?.activeDelivery ? (
                <div className="mt-3 space-y-3">
                  <div>
                    <h2 className="!m-0 !text-lg !font-semibold !tracking-normal text-slate-950 dark:text-slate-50">
                      {activeDeliveryTanker.activeDelivery.customer}
                    </h2>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                      {activeDeliveryTanker.activeDelivery.deliveryId}
                    </p>
                  </div>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500 dark:text-slate-400">
                        Status
                      </dt>
                      <dd className="font-medium text-slate-950 dark:text-slate-50">
                        {activeDeliveryTanker.activeDelivery.status}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500 dark:text-slate-400">
                        Tanker
                      </dt>
                      <dd className="font-medium text-slate-950 dark:text-slate-50">
                        {activeDeliveryTanker.plateNumber}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500 dark:text-slate-400">
                        Destination
                      </dt>
                      <dd className="text-right font-medium text-slate-950 dark:text-slate-50">
                        {activeDeliveryTanker.activeDelivery.destination}
                      </dd>
                    </div>
                  </dl>
                </div>
              ) : (
                <p className="mt-3 rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  Placeholder: active delivery details will appear here after
                  fleet-owner APIs are connected.
                </p>
              )}
            </section>

            <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                Missing data
              </p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                <li>Live tanker availability is mocked.</li>
                <li>Driver assignment data is mocked.</li>
                <li>Daily totals are placeholders.</li>
                <li>Active delivery uses sample data.</li>
              </ul>
            </section>
          </aside>
        </section>
      </div>
    </main>
  )
}
