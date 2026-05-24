import type { DeliveryStatus } from '../../../types/delivery'

type AssignedDeliveryCardProps = {
  actorId: string
  deliveryId: string
  status: DeliveryStatus | null
  onActorIdChange: (value: string) => void
  onDeliveryIdChange: (value: string) => void
}

export default function AssignedDeliveryCard({
  actorId,
  deliveryId,
  status,
  onActorIdChange,
  onDeliveryIdChange,
}: AssignedDeliveryCardProps) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-1 border-b border-slate-200 pb-4">
        <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">
          Assigned Delivery
        </p>
        <h2 className="!m-0 !text-lg !font-semibold !tracking-normal text-slate-950">
          Driver work order
        </h2>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-normal text-slate-500">
          Delivery ID
          <input
            className="h-10 rounded-md border border-slate-300 px-3 font-mono text-sm font-normal normal-case text-slate-950 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
            onChange={(event) => onDeliveryIdChange(event.target.value)}
            placeholder="Paste assigned delivery ID"
            value={deliveryId}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-normal text-slate-500">
          Driver ID
          <input
            className="h-10 rounded-md border border-slate-300 px-3 font-mono text-sm font-normal normal-case text-slate-950 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
            onChange={(event) => onActorIdChange(event.target.value)}
            placeholder="driver-id"
            value={actorId}
          />
        </label>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-slate-200 p-3">
          <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">
            Current Status
          </p>
          <p className="mt-1 text-base font-semibold text-slate-950">
            {status ?? 'Unknown'}
          </p>
        </div>
        <div className="rounded-md border border-slate-200 p-3">
          <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">
            Source
          </p>
          <p className="mt-1 text-sm text-slate-700">
            Uses backend driver execution actions.
          </p>
        </div>
      </div>
    </section>
  )
}
