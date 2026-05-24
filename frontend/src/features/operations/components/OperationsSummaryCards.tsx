import type {
  DeliveryAlertCandidate,
  OperationsDeliveryListItem,
} from '../services/operationsApi'

type OperationsSummaryCardsProps = {
  alerts: DeliveryAlertCandidate[]
  alertsError: string | null
  alertsLoading: boolean
  deliveries: OperationsDeliveryListItem[]
  deliveriesError: string | null
  deliveriesLoading: boolean
}

type SummaryCard = {
  label: string
  value: number | string
  detail: string
}

const countAlertsBySeverity = (
  alerts: DeliveryAlertCandidate[],
  severities: DeliveryAlertCandidate['severity'][],
) => alerts.filter((alert) => severities.includes(alert.severity)).length

const isProblemDelivery = (delivery: OperationsDeliveryListItem) =>
  delivery.activeAlertsCount > 0 ||
  delivery.status === 'FAILED' ||
  delivery.status === 'SKIPPED'

export default function OperationsSummaryCards({
  alerts,
  alertsError,
  alertsLoading,
  deliveries,
  deliveriesError,
  deliveriesLoading,
}: OperationsSummaryCardsProps) {
  const criticalHighAlertsCount = countAlertsBySeverity(alerts, [
    'CRITICAL',
    'HIGH',
  ])
  const demoScenarioCount = deliveries.filter(
    (delivery) => delivery.isDemoScenario,
  ).length
  const problemDeliveryCount = deliveries.filter(isProblemDelivery).length

  const deliveryDetail = deliveriesLoading
    ? 'loading deliveries'
    : deliveriesError
      ? 'delivery list unavailable'
      : 'after current filters'

  const alertsDetail = alertsLoading
    ? 'loading alerts'
    : alertsError
      ? 'alerts unavailable'
      : 'from alert scan'

  const cards: SummaryCard[] = [
    {
      label: 'Visible Deliveries',
      value: deliveriesLoading ? '...' : deliveries.length,
      detail: deliveryDetail,
    },
    {
      label: 'Active Alerts',
      value: alertsLoading ? '...' : alerts.length,
      detail: alertsDetail,
    },
    {
      label: 'Critical / High',
      value: alertsLoading ? '...' : criticalHighAlertsCount,
      detail: alertsLoading
        ? 'loading alerts'
        : `${countAlertsBySeverity(alerts, ['CRITICAL'])} critical`,
    },
    {
      label: 'Demo Scenarios',
      value: deliveriesLoading ? '...' : demoScenarioCount,
      detail: deliveryDetail,
    },
    {
      label: 'Problem Deliveries',
      value: deliveriesLoading ? '...' : problemDeliveryCount,
      detail: 'alerts, failed, or skipped',
    },
  ]

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
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
  )
}
