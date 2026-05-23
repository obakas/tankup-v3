import { useState } from 'react'
import DeliveryDetailDrawer from './components/DeliveryDetailDrawer'
import LiveDeliveriesBoard from './components/LiveDeliveriesBoard'
import OperationalAlertsPanel from './components/OperationalAlertsPanel'
import OperationsSummaryCards from './components/OperationsSummaryCards'
import { useDeliveryOperations } from './hooks/useDeliveryOperations'
import { useOperationsAlerts } from './hooks/useOperationsAlerts'

export default function OperationsDashboard() {
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(
    null,
  )
  const [boardRefreshSignal, setBoardRefreshSignal] = useState(0)
  const alerts = useOperationsAlerts()
  const selectedOperations = useDeliveryOperations(selectedDeliveryId)

  const handleDeliveryActionSuccess = () => {
    setBoardRefreshSignal((current) => current + 1)
    void alerts.refetch()
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-5 text-left text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">
              Operations
            </p>
            <h1 className="!m-0 mt-1 !text-2xl !font-semibold !tracking-normal text-slate-950 sm:!text-3xl">
              Control Room
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span className="rounded-full border border-slate-300 bg-white px-3 py-1">
              Alerts poll every 10s
            </span>
            <span className="rounded-full border border-slate-300 bg-white px-3 py-1">
              No auth
            </span>
          </div>
        </header>

        <OperationsSummaryCards
          alerts={alerts.alerts}
          selectedDelivery={selectedOperations.data}
        />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <LiveDeliveriesBoard
            onSelectDelivery={setSelectedDeliveryId}
            refreshSignal={boardRefreshSignal}
            selectedDeliveryId={selectedDeliveryId}
          />

          <OperationalAlertsPanel
            alerts={alerts.alerts}
            error={alerts.error}
            generatedAt={alerts.generatedAt}
            loading={alerts.loading}
            onRefresh={alerts.refetch}
            onSelectDelivery={setSelectedDeliveryId}
            refreshing={alerts.refreshing}
            selectedDeliveryId={selectedDeliveryId}
          />
        </div>
      </div>

      {selectedDeliveryId ? (
        <button
          aria-label="Close delivery detail"
          className="fixed inset-0 z-10 bg-slate-950/20"
          onClick={() => setSelectedDeliveryId(null)}
          type="button"
        />
      ) : null}

      <DeliveryDetailDrawer
        deliveryId={selectedDeliveryId}
        onActionSuccess={handleDeliveryActionSuccess}
        onClose={() => setSelectedDeliveryId(null)}
      />
    </main>
  )
}
