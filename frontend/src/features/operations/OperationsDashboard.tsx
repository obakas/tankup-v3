import { useCallback, useState } from 'react'
import DemoScenarioIdsPanel from './components/DemoScenarioIdsPanel'
import DeliveryDetailDrawer from './components/DeliveryDetailDrawer'
import LiveDeliveriesBoard, {
  type LiveDeliveriesSnapshot,
} from './components/LiveDeliveriesBoard'
import OperationalAlertsPanel from './components/OperationalAlertsPanel'
import OperationsSummaryCards from './components/OperationsSummaryCards'
import { useOperationsAlerts } from './hooks/useOperationsAlerts'
import { useTheme } from './hooks/useTheme'

export default function OperationsDashboard() {
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(
    null,
  )
  const [boardRefreshSignal, setBoardRefreshSignal] = useState(0)
  const [detailRefreshSignal, setDetailRefreshSignal] = useState(0)
  const [liveDeliveriesSnapshot, setLiveDeliveriesSnapshot] =
    useState<LiveDeliveriesSnapshot>({
      deliveries: [],
      loading: true,
      refreshing: false,
      error: null,
    })
  const alerts = useOperationsAlerts()
  const { theme, toggleTheme } = useTheme()

  const handleVisibleDeliveriesChange = useCallback(
    (snapshot: LiveDeliveriesSnapshot) => {
      setLiveDeliveriesSnapshot(snapshot)
    },
    [],
  )

  const handleDeliveryActionSuccess = () => {
    setBoardRefreshSignal((current) => current + 1)
    void alerts.refetch()
  }

  const handleGlobalRefresh = useCallback(() => {
    setBoardRefreshSignal((current) => current + 1)
    setDetailRefreshSignal((current) => current + 1)
    void alerts.refetch()
  }, [alerts])

  const globalRefreshing =
    alerts.loading ||
    alerts.refreshing ||
    liveDeliveriesSnapshot.loading ||
    liveDeliveriesSnapshot.refreshing

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-5 text-left text-slate-950 transition-colors dark:bg-slate-950 dark:text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
              Operations
            </p>
            <h1 className="!m-0 mt-1 !text-2xl !font-semibold !tracking-normal text-slate-950 dark:text-slate-50 sm:!text-3xl">
              Control Room
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <span className="rounded-full border border-slate-300 bg-white px-3 py-1 dark:border-slate-700 dark:bg-slate-900">
              Auto-refresh every 10s
            </span>
            <span className="rounded-full border border-slate-300 bg-white px-3 py-1 dark:border-slate-700 dark:bg-slate-900">
              No auth
            </span>
            <button
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 transition hover:border-cyan-600 hover:text-cyan-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-cyan-400 dark:hover:text-cyan-300"
              onClick={toggleTheme}
              type="button"
            >
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
            <button
              className="h-9 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:bg-slate-300 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
              disabled={globalRefreshing}
              onClick={handleGlobalRefresh}
              type="button"
            >
              {globalRefreshing ? 'Refreshing' : 'Refresh All'}
            </button>
          </div>
        </header>

        <OperationsSummaryCards
          alerts={alerts.alerts}
          alertsError={alerts.error}
          alertsLoading={alerts.loading}
          deliveries={liveDeliveriesSnapshot.deliveries}
          deliveriesError={liveDeliveriesSnapshot.error}
          deliveriesLoading={liveDeliveriesSnapshot.loading}
        />

        <DemoScenarioIdsPanel
          onSelectDelivery={setSelectedDeliveryId}
          selectedDeliveryId={selectedDeliveryId}
        />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <LiveDeliveriesBoard
            onVisibleDeliveriesChange={handleVisibleDeliveriesChange}
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
          className="fixed inset-0 z-10 bg-slate-950/20 dark:bg-black/50"
          onClick={() => setSelectedDeliveryId(null)}
          type="button"
        />
      ) : null}

      <DeliveryDetailDrawer
        deliveryId={selectedDeliveryId}
        onActionSuccess={handleDeliveryActionSuccess}
        onClose={() => setSelectedDeliveryId(null)}
        refreshSignal={detailRefreshSignal}
      />
    </main>
  )
}
