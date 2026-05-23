import type {
  DeliveryAlertCandidate,
  DeliveryOperationsView,
} from '../services/operationsApi'

type OperationsSummaryCardsProps = {
  alerts: DeliveryAlertCandidate[]
  selectedDelivery: DeliveryOperationsView | null
}

const severityCount = (alerts: DeliveryAlertCandidate[], severity: string) =>
  alerts.filter((alert) => alert.severity === severity).length

export default function OperationsSummaryCards({
  alerts,
  selectedDelivery,
}: OperationsSummaryCardsProps) {
  const activeDeliveryCount = new Set(alerts.map((alert) => alert.deliveryId))
    .size

  const cards = [
    {
      label: 'Active Alerts',
      value: alerts.length,
      detail: `${severityCount(alerts, 'CRITICAL')} critical`,
    },
    {
      label: 'Flagged Deliveries',
      value: activeDeliveryCount,
      detail: 'from operations alert scan',
    },
    {
      label: 'High Severity',
      value: severityCount(alerts, 'HIGH'),
      detail: `${severityCount(alerts, 'MEDIUM')} medium`,
    },
    {
      label: 'Selected Status',
      value: selectedDelivery?.delivery.status ?? 'None',
      detail: selectedDelivery
        ? `${selectedDelivery.currentStatusAge.ageMinutes} min in status`
        : 'choose a delivery',
    },
  ]

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <article
          className="rounded-md border border-slate-200 bg-white p-4 shadow-sm"
          key={card.label}
        >
          <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">
            {card.label}
          </p>
          <p className="mt-2 break-words text-2xl font-semibold leading-tight text-slate-950">
            {card.value}
          </p>
          <p className="mt-1 text-sm text-slate-600">{card.detail}</p>
        </article>
      ))}
    </section>
  )
}
