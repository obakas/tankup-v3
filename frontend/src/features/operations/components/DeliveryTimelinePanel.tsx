import type { DeliveryTimeline } from '../services/operationsApi'

type DeliveryTimelinePanelProps = {
  timeline: DeliveryTimeline | null
  loading: boolean
  error: string | null
}

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))

export default function DeliveryTimelinePanel({
  timeline,
  loading,
  error,
}: DeliveryTimelinePanelProps) {
  if (loading) {
    return (
      <div className="rounded-md border border-slate-200 p-4 text-sm text-slate-600">
        Loading delivery timeline.
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        {error}
      </div>
    )
  }

  if (!timeline || timeline.timeline.length === 0) {
    return (
      <div className="rounded-md border border-slate-200 p-4 text-sm text-slate-600">
        No timeline records found for this delivery.
      </div>
    )
  }

  return (
    <section>
      <h3 className="text-sm font-semibold uppercase tracking-normal text-slate-500">
        Timeline
      </h3>
      <div className="mt-3 flex flex-col gap-3">
        {timeline.timeline.map((entry) => (
          <article
            className="rounded-md border border-slate-200 p-3"
            key={`${entry.timestamp}-${entry.source}-${entry.type}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                {entry.source}
              </span>
              <span className="text-xs text-slate-500">
                {formatDateTime(entry.timestamp)}
              </span>
            </div>
            <p className="mt-2 text-sm font-semibold text-slate-950">
              {entry.message}
            </p>
            <div className="mt-2 grid gap-1 text-xs text-slate-600">
              <span>Type: {entry.type}</span>
              <span>
                Actor: {entry.actorType ?? 'Unknown'} / {entry.actorId ?? 'none'}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
