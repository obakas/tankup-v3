import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDriverExecution } from '../../../hooks/useDriverExecution'
import type { DeliveryStatus, JsonValue } from '../../../types/delivery'
import { useDeliveryOperations } from '../hooks/useDeliveryOperations'
import { useDeliveryTimeline } from '../hooks/useDeliveryTimeline'
import type {
  AssignmentDecisionSummary,
  AssignmentOfferHistoryItem,
  AssignmentPendingOffer,
  DeliveryTimelineEntry,
  OfferStatus,
} from '../services/operationsApi'
import {
  acceptOffer,
  rejectOffer,
  runAssignment,
} from '../services/operationsApi'
import DeliveryTimelinePanel from './DeliveryTimelinePanel'

type DeliveryDetailDrawerProps = {
  deliveryId: string | null
  onActionSuccess: () => void
  onClose: () => void
  refreshSignal: number
}

const fieldClass =
  'rounded-md border border-slate-200 p-3 dark:border-slate-800'
const demoOtpFallback = '000000'

const formatDateTime = (value: string | null) => {
  if (!value) {
    return 'None'
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

const formatJson = (value: unknown) => JSON.stringify(value, null, 2)

const assignmentAuditTypes = new Set([
  'JOB_OFFER_CREATED',
  'JOB_OFFER_ACCEPTED',
  'JOB_OFFER_REJECTED',
  'JOB_OFFER_EXPIRED',
  'JOB_OFFER_CANCELLED',
])

type AssignmentHistoryItem = {
  key: string
  id: string | null
  deliveryId: string | null
  type: string
  status: OfferStatus | null
  tankerId: string | null
  score: number | null
  expiresAt: string | null
  respondedAt: string | null
  createdAt: string | null
  actor: string | null
  reason: string | null
}

type VisiblePendingOffer = {
  id: string
  deliveryId: string | null
  tankerId: string
  score: number | null
  reason: string | null
  expiresAt: string | null
  createdAt: string | null
}

type VisibleAssignmentDecision = Omit<AssignmentDecisionSummary, 'createdAt'> & {
  createdAt: string | null
}

type AssignmentVisibilityState = {
  pendingOffer: VisiblePendingOffer | null
  offerHistory: AssignmentHistoryItem[]
  retryCount: number | null
  assignmentDecisions: VisibleAssignmentDecision[]
  lastDecision: VisibleAssignmentDecision | null
  source: 'direct' | 'timeline' | 'none'
}

const isRecord = (value: unknown): value is Record<string, JsonValue> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const getRecord = (value: unknown) => (isRecord(value) ? value : {})

const getString = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value : null

const getNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const getStatusFromAuditType = (type: string): OfferStatus | null => {
  if (type === 'JOB_OFFER_CREATED') {
    return 'PENDING'
  }

  if (type === 'JOB_OFFER_ACCEPTED') {
    return 'ACCEPTED'
  }

  if (type === 'JOB_OFFER_REJECTED') {
    return 'REJECTED'
  }

  if (type === 'JOB_OFFER_EXPIRED') {
    return 'EXPIRED'
  }

  if (type === 'JOB_OFFER_CANCELLED') {
    return 'CANCELLED'
  }

  return null
}

const getOfferStatus = (type: string, after: Record<string, JsonValue>) =>
  (getString(after.status) as OfferStatus | null) ?? getStatusFromAuditType(type)

const isDecisionResult = (
  status: OfferStatus | null,
): status is AssignmentDecisionSummary['result'] =>
  status === 'ACCEPTED' || status === 'REJECTED' || status === 'EXPIRED'

const isAssignmentAuditEntry = (entry: DeliveryTimelineEntry) =>
  entry.source === 'AUDIT' && assignmentAuditTypes.has(entry.type)

const getAssignmentHistoryFromTimeline = (
  entries: DeliveryTimelineEntry[],
): AssignmentHistoryItem[] =>
  entries.filter(isAssignmentAuditEntry).map((entry) => {
    const metadata = getRecord(entry.metadata)
    const after = getRecord(metadata.after)

    return {
      key: `${entry.type}-${entry.timestamp}-${getString(metadata.entityId) ?? ''}`,
      id: getString(metadata.entityId) ?? getString(metadata.jobOfferId),
      deliveryId: getString(after.deliveryId) ?? getString(metadata.deliveryId),
      type: entry.type,
      status: getOfferStatus(entry.type, after),
      tankerId: getString(after.tankerId) ?? getString(metadata.tankerId),
      score: getNumber(after.score) ?? getNumber(metadata.score),
      expiresAt: getString(after.expiresAt) ?? getString(metadata.expiresAt),
      respondedAt: getString(after.respondedAt) ?? getString(metadata.respondedAt),
      createdAt: getString(after.createdAt) ?? entry.timestamp,
      actor: `${entry.actorType ?? 'SYSTEM'} / ${entry.actorId ?? 'none'}`,
      reason: getString(metadata.reason),
    }
  })

const formatDirectOfferHistoryItem = (
  offer: AssignmentOfferHistoryItem,
): AssignmentHistoryItem => ({
  key: offer.id,
  id: offer.id,
  deliveryId: null,
  type: `JOB_OFFER_${offer.status}`,
  status: offer.status,
  tankerId: offer.tankerId,
  score: offer.score,
  expiresAt: offer.expiresAt,
  respondedAt: offer.respondedAt,
  createdAt: offer.createdAt,
  actor: null,
  reason: offer.reason,
})

const formatDirectPendingOffer = (
  offer: AssignmentPendingOffer,
): VisiblePendingOffer => ({
  id: offer.id,
  deliveryId: offer.deliveryId,
  tankerId: offer.tankerId,
  score: offer.score,
  reason: offer.reason,
  expiresAt: offer.expiresAt,
  createdAt: offer.createdAt,
})

const getTimelinePendingOffer = (
  offerHistory: AssignmentHistoryItem[],
): VisiblePendingOffer | null => {
  const latestByOffer = new Map<string, AssignmentHistoryItem>()

  for (const item of offerHistory) {
    if (!item.id) {
      continue
    }

    latestByOffer.set(item.id, item)
  }

  const pending = [...latestByOffer.values()]
    .reverse()
    .find((item) => item.status === 'PENDING')

  if (!pending?.id || !pending.tankerId) {
    return null
  }

  return {
    id: pending.id,
    deliveryId: pending.deliveryId,
    tankerId: pending.tankerId,
    expiresAt: pending.expiresAt,
    createdAt: pending.createdAt,
    score: pending.score,
    reason: pending.reason,
  }
}

const getLastDecisionFromHistory = (
  offerHistory: AssignmentHistoryItem[],
): VisibleAssignmentDecision | null => {
  const lastDecision = [...offerHistory]
    .reverse()
    .find((item) => item.status && item.status !== 'PENDING')

  if (!lastDecision || !isDecisionResult(lastDecision.status)) {
    return null
  }

  return {
    id: lastDecision.id ?? `timeline-${lastDecision.type}-${lastDecision.createdAt ?? ''}`,
    tankerId: lastDecision.tankerId,
    score: lastDecision.score,
    result: lastDecision.status,
    reason: lastDecision.reason,
    createdAt: lastDecision.createdAt,
  }
}

const getAssignmentVisibility = (
  directAssignment:
    | NonNullable<ReturnType<typeof useDeliveryOperations>['data']>['assignment']
    | undefined,
  timelineEntries: DeliveryTimelineEntry[],
): AssignmentVisibilityState => {
  if (directAssignment) {
    const directOfferHistory = directAssignment.offerHistory.map(
      formatDirectOfferHistoryItem,
    )

    return {
      pendingOffer: directAssignment.pendingOffer
        ? formatDirectPendingOffer(directAssignment.pendingOffer)
        : null,
      offerHistory: directOfferHistory,
      retryCount: directAssignment.retryCount,
      assignmentDecisions: directAssignment.assignmentDecisions,
      lastDecision: directAssignment.lastAssignmentDecision,
      source: 'direct',
    }
  }

  const offerHistory = getAssignmentHistoryFromTimeline(timelineEntries)
  const lastDecision = getLastDecisionFromHistory(offerHistory)

  return {
    pendingOffer: getTimelinePendingOffer(offerHistory),
    offerHistory,
    retryCount:
      offerHistory.length > 0 ? Math.max(offerHistory.length - 1, 0) : null,
    assignmentDecisions: lastDecision ? [lastDecision] : [],
    lastDecision,
    source: offerHistory.length > 0 ? 'timeline' : 'none',
  }
}

const formatCountdown = (expiresAt: string | null, now: number) => {
  if (!expiresAt) {
    return 'Expiry not provided'
  }

  const expiresAtMs = new Date(expiresAt).getTime()

  if (!Number.isFinite(expiresAtMs)) {
    return 'Invalid expiry'
  }

  const deltaSeconds = Math.ceil((expiresAtMs - now) / 1000)
  const absoluteSeconds = Math.abs(deltaSeconds)
  const minutes = Math.floor(absoluteSeconds / 60)
  const seconds = absoluteSeconds % 60
  const label = `${minutes}:${String(seconds).padStart(2, '0')}`

  return deltaSeconds >= 0 ? `Expires in ${label}` : `Expired ${label} ago`
}

const operatorActor = {
  actorType: 'ADMIN' as const,
  actorId: 'operations-control-room',
}

type AssignmentActionName = 'run' | 'refresh' | 'accept' | 'reject'

type DrawerDelivery = NonNullable<
  ReturnType<typeof useDeliveryOperations>['data']
>['delivery']

const isAssignmentReadyDelivery = (delivery: DrawerDelivery) =>
  delivery.status === 'CREATED' &&
  delivery.tankerId === null &&
  delivery.driverId === null

const getOperatorNextStep = (
  delivery: DrawerDelivery,
  pendingOffer: VisiblePendingOffer | null,
) => {
  if (pendingOffer) {
    return 'Pending tanker offer waiting for accept/reject.'
  }

  if (isAssignmentReadyDelivery(delivery)) {
    return 'Run assignment to offer this delivery to an available tanker.'
  }

  switch (delivery.status) {
    case 'CREATED':
      return 'Review assignment readiness before running assignment.'
    case 'ASSIGNED':
      return 'Delivery assigned. Continue to driver execution.'
    case 'LOADING':
      return 'Tanker is loading.'
    case 'EN_ROUTE':
      return 'Tanker is on the way.'
    case 'ARRIVED':
      return 'Start measurement.'
    case 'MEASURING':
      return 'Complete measurement.'
    case 'AWAITING_OTP':
      return 'Confirm customer OTP.'
    case 'COMPLETED':
      return 'Delivery completed.'
    case 'FAILED':
      return 'Delivery failed. Review operational notes.'
    case 'SKIPPED':
      return 'Delivery skipped. Review operational notes.'
  }
}

const getDeliveryExecutionAction = (status: DeliveryStatus) => {
  switch (status) {
    case 'ASSIGNED':
      return 'Start loading'
    case 'LOADING':
      return 'Depart / mark en route'
    case 'EN_ROUTE':
      return 'Mark arrived'
    case 'ARRIVED':
      return 'Start measurement'
    case 'MEASURING':
      return 'Complete measurement'
    case 'AWAITING_OTP':
      return 'Confirm OTP'
    case 'COMPLETED':
      return 'Delivery complete'
    case 'CREATED':
    case 'FAILED':
    case 'SKIPPED':
      return null
  }
}

const getSeededDemoOtpCode = (delivery: DrawerDelivery) => {
  if (delivery.siteId?.endsWith(':site:awaiting-otp-too-long')) {
    return '482913'
  }

  if (delivery.siteId?.endsWith(':site:repeated-otp-failures')) {
    return '771204'
  }

  return null
}

const failStatuses: DeliveryStatus[] = [
  'LOADING',
  'EN_ROUTE',
  'ARRIVED',
  'MEASURING',
  'AWAITING_OTP',
]

const skipStatuses: DeliveryStatus[] = [
  'ASSIGNED',
  'LOADING',
  'EN_ROUTE',
  'ARRIVED',
]

const getAlertKey = (
  alert:
    | NonNullable<ReturnType<typeof useDeliveryOperations>['data']>['alerts']['unresolved'][number]
    | NonNullable<ReturnType<typeof useDeliveryOperations>['data']>['alerts']['candidates'][number],
) => {
  if ('createdAt' in alert) {
    return `${alert.type}-${alert.createdAt}`
  }

  return `${alert.type}-${alert.ageMinutes}`
}

export default function DeliveryDetailDrawer({
  deliveryId,
  onActionSuccess,
  onClose,
  refreshSignal,
}: DeliveryDetailDrawerProps) {
  const lastRefreshSignal = useRef(refreshSignal)
  const [otpCode, setOtpCode] = useState('')
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [assignmentAction, setAssignmentAction] =
    useState<AssignmentActionName | null>(null)
  const [assignmentMessage, setAssignmentMessage] = useState<string | null>(
    null,
  )
  const [assignmentError, setAssignmentError] = useState<string | null>(null)
  const [executionAction, setExecutionAction] = useState<
    | 'start-loading'
    | 'start-route'
    | 'arrive'
    | 'start-measuring'
    | 'submit-measurement'
    | 'confirm-complete'
    | null
  >(null)
  const [executionMessage, setExecutionMessage] = useState<string | null>(null)
  const [executionError, setExecutionError] = useState<string | null>(null)
  const [countdownNow, setCountdownNow] = useState(() => Date.now())
  const operations = useDeliveryOperations(deliveryId)
  const timeline = useDeliveryTimeline(deliveryId)
  const driverExecution = useDriverExecution()
  const data = operations.data
  const timelineEntries = timeline.data?.timeline ?? []
  const assignmentVisibility = useMemo(
    () => getAssignmentVisibility(data?.assignment, timelineEntries),
    [data?.assignment, timelineEntries],
  )
  const activeAlerts = data
    ? [...data.alerts.unresolved, ...data.alerts.candidates]
    : []
  const busy =
    operations.loading ||
    timeline.loading ||
    driverExecution.loading ||
    Boolean(assignmentAction) ||
    Boolean(executionAction)

  const refresh = useCallback(async () => {
    await Promise.all([operations.refetch(), timeline.refetch()])
  }, [operations.refetch, timeline.refetch])

  useEffect(() => {
    if (lastRefreshSignal.current === refreshSignal) {
      return
    }

    lastRefreshSignal.current = refreshSignal

    if (!deliveryId) {
      return
    }

    void refresh()
  }, [deliveryId, refresh, refreshSignal])

  useEffect(() => {
    if (!assignmentVisibility.pendingOffer?.expiresAt) {
      return
    }

    setCountdownNow(Date.now())
    const timerId = window.setInterval(() => {
      setCountdownNow(Date.now())
    }, 1000)

    return () => window.clearInterval(timerId)
  }, [assignmentVisibility.pendingOffer?.expiresAt])

  if (!deliveryId) {
    return null
  }

  const refreshAfterAction = async () => {
    await refresh()
    onActionSuccess()
  }

  const runAction = async (
    action: () => ReturnType<typeof driverExecution.failDelivery>,
    successMessage: string,
  ) => {
    setActionMessage(null)
    setActionError(null)

    const response = await action()

    if (!response.success) {
      setActionError(response.error)
      return
    }

    setActionMessage(successMessage)
    setOtpCode('')
    await refreshAfterAction()
  }

  const runAssignmentControl = async (
    actionName: AssignmentActionName,
    action: () => Promise<{ success: true } | { success: false; error: string }>,
    successMessage: string,
  ) => {
    setAssignmentAction(actionName)
    setAssignmentMessage(null)
    setAssignmentError(null)

    const response = await action()

    if (!response.success) {
      setAssignmentError(response.error)
      setAssignmentAction(null)
      return
    }

    setAssignmentMessage(successMessage)
    await refreshAfterAction()
    setAssignmentAction(null)
  }

  const confirmDangerousAction = (label: string) =>
    window.confirm(`Confirm ${label} for delivery ${deliveryId}?`)

  const canFail = data ? failStatuses.includes(data.delivery.status) : false
  const canSkip = data ? skipStatuses.includes(data.delivery.status) : false
  const canConfirmOtp =
    data?.delivery.status === 'AWAITING_OTP' && otpCode.trim().length > 0
  const canComplete =
    data?.delivery.status === 'AWAITING_OTP' &&
    data.otp.state === 'VERIFIED' &&
    Boolean(data.delivery.customerId)
  const canStartLoading =
    data?.delivery.status === 'ASSIGNED' && !busy
  const canStartRoute = data?.delivery.status === 'LOADING' && !busy
  const canArrive = data?.delivery.status === 'EN_ROUTE' && !busy
  const canStartMeasuring = data?.delivery.status === 'ARRIVED' && !busy
  const canSubmitMeasurement = data?.delivery.status === 'MEASURING' && !busy
  const canConfirmAndComplete =
    data?.delivery.status === 'AWAITING_OTP' && !busy
  const hasAssignmentActivity =
    Boolean(assignmentVisibility.pendingOffer) ||
    assignmentVisibility.offerHistory.length > 0 ||
    assignmentVisibility.assignmentDecisions.length > 0
  const deliveryExecutionAction = data
    ? getDeliveryExecutionAction(data.delivery.status)
    : null

  const handleFail = () => {
    if (!deliveryId || !confirmDangerousAction('failure')) {
      return
    }

    void runAction(
      () =>
        driverExecution.failDelivery(deliveryId, {
          ...operatorActor,
          reason: 'Marked failed from operations control room',
          metadata: { source: 'operations_dashboard' },
        }),
      'Delivery failure recorded.',
    )
  }

  const handleSkip = () => {
    if (!deliveryId || !confirmDangerousAction('skip')) {
      return
    }

    void runAction(
      () =>
        driverExecution.skipDelivery(deliveryId, {
          ...operatorActor,
          reason: 'Marked skipped from operations control room',
          metadata: { source: 'operations_dashboard' },
        }),
      'Delivery skip recorded.',
    )
  }

  const handleConfirmOtp = () => {
    if (!deliveryId) {
      return
    }

    void runAction(
      () =>
        driverExecution.confirmOtp(deliveryId, {
          actorType: 'CUSTOMER',
          actorId: data?.delivery.customerId ?? 'operations-control-room',
          otpCode: otpCode.trim(),
        }),
      'Delivery OTP confirmed.',
    )
  }

  const handleComplete = () => {
    const customerId = data?.delivery.customerId

    if (
      !deliveryId ||
      !customerId ||
      !confirmDangerousAction('completion')
    ) {
      return
    }

    void runAction(
      () =>
        driverExecution.completeDelivery(deliveryId, {
          actorType: 'CUSTOMER',
          actorId: customerId,
        }),
      'Delivery completed.',
    )
  }

  const handleStartLoading = () => {
    if (!deliveryId || data?.delivery.status !== 'ASSIGNED') {
      return
    }

    setExecutionAction('start-loading')
    setExecutionMessage(null)
    setExecutionError(null)

    void (async () => {
      const response = await driverExecution.startLoading(deliveryId, {
        actorType: 'DRIVER',
        actorId: data.delivery.driverId ?? 'operations-control-room',
      })

      if (!response.success) {
        setExecutionError(response.error)
        setExecutionAction(null)
        return
      }

      setExecutionMessage('Loading started.')
      await refreshAfterAction()
      setExecutionAction(null)
    })()
  }

  const handleStartRoute = () => {
    if (!deliveryId || data?.delivery.status !== 'LOADING') {
      return
    }

    setExecutionAction('start-route')
    setExecutionMessage(null)
    setExecutionError(null)

    void (async () => {
      const response = await driverExecution.startRoute(deliveryId, {
        actorType: 'DRIVER',
        actorId: data.delivery.driverId ?? 'operations-control-room',
      })

      if (!response.success) {
        setExecutionError(response.error)
        setExecutionAction(null)
        return
      }

      setExecutionMessage('Delivery marked en route.')
      await refreshAfterAction()
      setExecutionAction(null)
    })()
  }

  const handleArrive = () => {
    if (!deliveryId || data?.delivery.status !== 'EN_ROUTE') {
      return
    }

    setExecutionAction('arrive')
    setExecutionMessage(null)
    setExecutionError(null)

    void (async () => {
      const response = await driverExecution.arrive(deliveryId, {
        actorType: 'DRIVER',
        actorId: data.delivery.driverId ?? 'operations-control-room',
      })

      if (!response.success) {
        setExecutionError(response.error)
        setExecutionAction(null)
        return
      }

      setExecutionMessage('Driver arrival recorded.')
      await refreshAfterAction()
      setExecutionAction(null)
    })()
  }

  const handleStartMeasuring = () => {
    if (!deliveryId || data?.delivery.status !== 'ARRIVED') {
      return
    }

    setExecutionAction('start-measuring')
    setExecutionMessage(null)
    setExecutionError(null)

    void (async () => {
      const response = await driverExecution.startMeasuring(deliveryId, {
        actorType: 'DRIVER',
        actorId: data.delivery.driverId ?? 'operations-control-room',
      })

      if (!response.success) {
        setExecutionError(response.error)
        setExecutionAction(null)
        return
      }

      setExecutionMessage('Measurement started.')
      await refreshAfterAction()
      setExecutionAction(null)
    })()
  }

  const handleSubmitMeasurement = () => {
    if (!deliveryId || data?.delivery.status !== 'MEASURING') {
      return
    }

    setExecutionAction('submit-measurement')
    setExecutionMessage(null)
    setExecutionError(null)

    void (async () => {
      const response = await driverExecution.submitMeasurement(deliveryId, {
        actorType: 'DRIVER',
        actorId: data.delivery.driverId ?? 'operations-control-room',
        measurement: {
          source: 'operations_dashboard_demo',
          volumeLitres: 12_000,
        },
      })

      if (!response.success) {
        setExecutionError(response.error)
        setExecutionAction(null)
        return
      }

      setExecutionMessage('Measurement completed.')
      await refreshAfterAction()
      setExecutionAction(null)
    })()
  }

  const handleConfirmAndComplete = () => {
    if (!deliveryId || data?.delivery.status !== 'AWAITING_OTP') {
      return
    }

    const nextOtpCode =
      otpCode.trim() || getSeededDemoOtpCode(data.delivery) || demoOtpFallback
    const customerId = data.delivery.customerId ?? 'operations-control-room'

    setExecutionAction('confirm-complete')
    setExecutionMessage(null)
    setExecutionError(null)

    void (async () => {
      if (data.otp.state !== 'VERIFIED') {
        const otpResponse = await driverExecution.confirmOtp(deliveryId, {
          actorType: 'CUSTOMER',
          actorId: customerId,
          otpCode: nextOtpCode,
        })

        if (!otpResponse.success) {
          setExecutionError(otpResponse.error)
          setExecutionAction(null)
          return
        }
      }

      const completeResponse = await driverExecution.completeDelivery(deliveryId, {
        actorType: 'CUSTOMER',
        actorId: customerId,
      })

      if (!completeResponse.success) {
        setExecutionError(completeResponse.error)
        setExecutionAction(null)
        return
      }

      setExecutionMessage(
        nextOtpCode === demoOtpFallback
          ? 'Delivery completed using demo OTP fallback.'
          : 'OTP confirmed and delivery completed.',
      )
      setOtpCode('')
      await refreshAfterAction()
      setExecutionAction(null)
    })()
  }

  const handleAssignmentRefresh = () => {
    void runAssignmentControl(
      'refresh',
      async () => {
        await refresh()
        return { success: true }
      },
      'Assignment state refreshed.',
    )
  }

  const handleRunAssignment = () => {
    if (!deliveryId || assignmentVisibility.pendingOffer) {
      return
    }

    void runAssignmentControl(
      'run',
      () =>
        runAssignment({
          deliveryId,
          ...operatorActor,
        }),
      'Assignment run completed.',
    )
  }

  const handleAcceptOffer = () => {
    const offer = assignmentVisibility.pendingOffer

    if (
      !offer ||
      !window.confirm(`Accept assignment offer ${offer.id} for this delivery?`)
    ) {
      return
    }

    void runAssignmentControl(
      'accept',
      () =>
        acceptOffer(offer.id, {
          ...operatorActor,
          reason: 'Accepted from operations dashboard dev controls',
        }),
      'Assignment offer accepted.',
    )
  }

  const handleRejectOffer = () => {
    const offer = assignmentVisibility.pendingOffer

    if (
      !offer ||
      !window.confirm(`Reject assignment offer ${offer.id} for this delivery?`)
    ) {
      return
    }

    void runAssignmentControl(
      'reject',
      () =>
        rejectOffer(offer.id, {
          ...operatorActor,
          reason: 'Rejected from operations dashboard dev controls',
        }),
      'Assignment offer rejected.',
    )
  }

  return (
    <aside className="fixed inset-y-0 right-0 z-20 flex w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-4 dark:border-slate-800">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
            Delivery Detail
          </p>
          <h2 className="!m-0 mt-1 truncate !text-lg !font-semibold !tracking-normal text-slate-950 dark:text-slate-50">
            {deliveryId}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="h-9 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-800 transition hover:border-cyan-600 hover:text-cyan-700 dark:border-slate-700 dark:text-slate-100 dark:hover:border-cyan-400 dark:hover:text-cyan-300"
            disabled={busy}
            onClick={refresh}
            type="button"
          >
            {busy ? 'Working' : 'Refresh'}
          </button>
          <button
            className="h-9 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {operations.loading ? (
          <div className="rounded-md border border-slate-200 p-4 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
            Loading delivery operations.
          </div>
        ) : null}

        {!operations.loading && operations.error ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
            {operations.error}
          </div>
        ) : null}

        {!operations.loading && !operations.error && !data ? (
          <div className="rounded-md border border-slate-200 p-4 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
            No delivery detail found.
          </div>
        ) : null}

        {!operations.loading && !operations.error && data ? (
          <div className="flex flex-col gap-5">
            <section className="grid gap-3 sm:grid-cols-2">
              <div className={fieldClass}>
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                  Status
                </p>
                <p className="mt-1 text-base font-semibold text-slate-950 dark:text-slate-50">
                  {data.delivery.status}
                </p>
              </div>
              <div className={fieldClass}>
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                  Age
                </p>
                <p className="mt-1 text-base font-semibold text-slate-950 dark:text-slate-50">
                  {data.currentStatusAge.ageMinutes} min
                </p>
              </div>
              <div className={fieldClass}>
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                  OTP
                </p>
                <p className="mt-1 text-base font-semibold text-slate-950 dark:text-slate-50">
                  {data.otp.state}
                </p>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  Attempts: {data.otp.attemptCount}
                </p>
              </div>
              <div className={fieldClass}>
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                  Generated
                </p>
                <p className="mt-1 text-sm font-medium text-slate-950 dark:text-slate-50">
                  {formatDateTime(data.generatedAt)}
                </p>
              </div>
            </section>

            <section className="rounded-md border border-cyan-200 bg-cyan-50 p-4 dark:border-cyan-800 dark:bg-cyan-950/30">
              <p className="text-xs font-semibold uppercase tracking-normal text-cyan-800 dark:text-cyan-200">
                Operator Next Step
              </p>
              <p className="mt-2 text-sm font-semibold text-cyan-950 dark:text-cyan-50">
                {getOperatorNextStep(
                  data.delivery,
                  assignmentVisibility.pendingOffer,
                )}
              </p>
            </section>

            <section className="rounded-md border border-slate-200 dark:border-slate-800 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                Operator Action
              </h3>
              <p className="mt-2 text-sm text-slate-800 dark:text-slate-100">
                {data.suggestedOperatorAction}
              </p>
            </section>

            <section className="rounded-md border border-slate-200 dark:border-slate-800 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                Actions
              </h3>

              {actionMessage ? (
                <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
                  {actionMessage}
                </div>
              ) : null}

              {actionError ? (
                <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
                  {actionError}
                </div>
              ) : null}

              <div className="mt-3 flex flex-col gap-3">
                {data.delivery.status === 'AWAITING_OTP' ? (
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                      OTP
                      <input
                        className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal normal-case text-slate-950 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-cyan-400 dark:focus:ring-cyan-900/50"
                        inputMode="numeric"
                        onChange={(event) => setOtpCode(event.target.value)}
                        placeholder="Enter customer OTP"
                        value={otpCode}
                      />
                    </label>
                    <div className="flex items-end">
                      <button
                        className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-800 transition hover:border-cyan-600 hover:text-cyan-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-100 dark:hover:border-cyan-400 dark:hover:text-cyan-300 sm:w-auto"
                        disabled={busy || !canConfirmOtp}
                        onClick={handleConfirmOtp}
                        type="button"
                      >
                        Confirm OTP
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  {canFail ? (
                    <button
                      className="rounded-md border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:border-rose-500 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-800 dark:text-rose-200 dark:hover:border-rose-500 dark:hover:bg-rose-950/40"
                      disabled={busy}
                      onClick={handleFail}
                      type="button"
                    >
                      Fail Delivery
                    </button>
                  ) : null}

                  {canSkip ? (
                    <button
                      className="rounded-md border border-amber-300 px-3 py-2 text-sm font-semibold text-amber-800 transition hover:border-amber-500 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-800 dark:text-amber-200 dark:hover:border-amber-500 dark:hover:bg-amber-950/40"
                      disabled={busy}
                      onClick={handleSkip}
                      type="button"
                    >
                      Skip Delivery
                    </button>
                  ) : null}

                  {data.delivery.status === 'AWAITING_OTP' ? (
                    <button
                      className="rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                      disabled={busy || !canComplete}
                      onClick={handleComplete}
                      title={
                        canComplete
                          ? undefined
                          : 'Completion requires verified OTP and a customer identifier.'
                      }
                      type="button"
                    >
                      Complete Delivery
                    </button>
                  ) : null}

                  {!canFail &&
                  !canSkip &&
                  data.delivery.status !== 'AWAITING_OTP' ? (
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      No operator actions are available for this status.
                    </p>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="grid gap-3 text-sm sm:grid-cols-2">
              <div className={fieldClass}>
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                  Driver
                </p>
                <p className="mt-1 break-words font-mono text-xs text-slate-800 dark:text-slate-100">
                  {data.delivery.driverId ?? 'Unassigned'}
                </p>
              </div>
              <div className={fieldClass}>
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                  Tanker
                </p>
                <p className="mt-1 break-words font-mono text-xs text-slate-800 dark:text-slate-100">
                  {data.delivery.tankerId ?? 'Unassigned'}
                </p>
              </div>
              <div className={fieldClass}>
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                  Customer
                </p>
                <p className="mt-1 break-words font-mono text-xs text-slate-800 dark:text-slate-100">
                  {data.delivery.customerId ?? 'Unknown'}
                </p>
              </div>
              <div className={fieldClass}>
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                  Site
                </p>
                <p className="mt-1 break-words font-mono text-xs text-slate-800 dark:text-slate-100">
                  {data.delivery.siteId ?? 'Unknown'}
                </p>
              </div>
            </section>

            {deliveryExecutionAction ? (
              <section className="rounded-md border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-normal text-emerald-800 dark:text-emerald-200">
                      Continue Delivery Execution
                    </p>
                    <p className="mt-2 text-sm text-emerald-950 dark:text-emerald-50">
                      Next operational action for this delivery.
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100">
                    {data.delivery.status}
                  </span>
                </div>

                <button
                  className="mt-3 w-full rounded-md bg-emerald-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400 sm:w-auto"
                  disabled={
                    !canStartLoading &&
                    !canStartRoute &&
                    !canArrive &&
                    !canStartMeasuring &&
                    !canSubmitMeasurement &&
                    !canConfirmAndComplete
                  }
                  onClick={
                    canStartLoading
                      ? handleStartLoading
                      : canStartRoute
                        ? handleStartRoute
                        : canArrive
                          ? handleArrive
                          : canStartMeasuring
                            ? handleStartMeasuring
                            : canSubmitMeasurement
                              ? handleSubmitMeasurement
                              : canConfirmAndComplete
                                ? handleConfirmAndComplete
                          : undefined
                  }
                  type="button"
                >
                  {executionAction === 'start-loading'
                    ? 'Starting loading'
                    : executionAction === 'start-route'
                      ? 'Marking en route'
                    : executionAction === 'arrive'
                      ? 'Marking arrived'
                    : executionAction === 'start-measuring'
                      ? 'Starting measurement'
                    : executionAction === 'submit-measurement'
                      ? 'Completing measurement'
                    : executionAction === 'confirm-complete'
                      ? 'Confirming OTP'
                    : deliveryExecutionAction}
                </button>

                <p className="mt-2 text-xs text-emerald-800 dark:text-emerald-100">
                  Execution actions will be connected to backend driver endpoints next.
                </p>

                {executionMessage ? (
                  <div className="mt-3 rounded-md border border-emerald-200 bg-white p-2 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100">
                    {executionMessage}
                  </div>
                ) : null}

                {executionError ? (
                  <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
                    {executionError}
                  </div>
                ) : null}

                <div className="mt-3 grid gap-2 text-xs text-emerald-950 dark:text-emerald-50 sm:grid-cols-2">
                  <div className="min-w-0">
                    <p className="font-semibold uppercase tracking-normal text-emerald-700 dark:text-emerald-200">
                      Tanker
                    </p>
                    <p className="mt-1 truncate font-mono">
                      {data.delivery.tankerId ?? 'Unassigned'}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold uppercase tracking-normal text-emerald-700 dark:text-emerald-200">
                      Driver
                    </p>
                    <p className="mt-1 truncate font-mono">
                      {data.delivery.driverId ?? 'Unassigned'}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold uppercase tracking-normal text-emerald-700 dark:text-emerald-200">
                      Delivery
                    </p>
                    <p className="mt-1 truncate font-mono">
                      {data.delivery.id}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold uppercase tracking-normal text-emerald-700 dark:text-emerald-200">
                      Customer
                    </p>
                    <p className="mt-1 truncate font-mono">
                      {data.delivery.customerId ?? 'Unknown'}
                    </p>
                  </div>
                </div>
              </section>
            ) : null}

            <section className="rounded-md border border-slate-200 dark:border-slate-800 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                  Assignment
                </h3>
                {assignmentVisibility.source !== 'none' ? (
                  <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {assignmentVisibility.source === 'direct'
                      ? 'Assignment API'
                      : 'Timeline audit'}
                  </span>
                ) : null}
              </div>

              <div className="mt-3 rounded-md border border-dashed border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-normal text-amber-800 dark:text-amber-200">
                      Dev / Operator Controls
                    </p>
                    <p className="mt-1 text-xs text-amber-900 dark:text-amber-100">
                      Manual assignment actions use the dev assignment API.
                    </p>
                  </div>
                  {assignmentAction ? (
                    <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-100">
                      Working
                    </span>
                  ) : null}
                </div>

                {assignmentMessage ? (
                  <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
                    {assignmentMessage}
                  </div>
                ) : null}

                {assignmentError ? (
                  <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
                    {assignmentError}
                  </div>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="rounded-md border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 transition hover:border-amber-500 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-800 dark:bg-slate-950 dark:text-amber-100 dark:hover:border-amber-500 dark:hover:bg-amber-950/50"
                    disabled={Boolean(assignmentAction)}
                    onClick={handleAssignmentRefresh}
                    type="button"
                  >
                    {assignmentAction === 'refresh'
                      ? 'Refreshing'
                      : 'Refresh Assignment'}
                  </button>

                  <button
                    className="rounded-md border border-cyan-300 bg-white px-3 py-2 text-xs font-semibold text-cyan-800 transition hover:border-cyan-500 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-cyan-800 dark:bg-slate-950 dark:text-cyan-100 dark:hover:border-cyan-500 dark:hover:bg-cyan-950/50"
                    disabled={
                      Boolean(assignmentAction) ||
                      Boolean(assignmentVisibility.pendingOffer)
                    }
                    onClick={handleRunAssignment}
                    title={
                      assignmentVisibility.pendingOffer
                        ? 'A pending offer already exists for this delivery.'
                        : undefined
                    }
                    type="button"
                  >
                    {assignmentAction === 'run'
                      ? 'Running'
                      : 'Run Assignment'}
                  </button>

                  <button
                    className="rounded-md border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 transition hover:border-emerald-500 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-800 dark:bg-slate-950 dark:text-emerald-100 dark:hover:border-emerald-500 dark:hover:bg-emerald-950/50"
                    disabled={
                      Boolean(assignmentAction) ||
                      !assignmentVisibility.pendingOffer
                    }
                    onClick={handleAcceptOffer}
                    type="button"
                  >
                    {assignmentAction === 'accept'
                      ? 'Accepting'
                      : 'Accept Offer'}
                  </button>

                  <button
                    className="rounded-md border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-800 transition hover:border-rose-500 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-800 dark:bg-slate-950 dark:text-rose-100 dark:hover:border-rose-500 dark:hover:bg-rose-950/50"
                    disabled={
                      Boolean(assignmentAction) ||
                      !assignmentVisibility.pendingOffer
                    }
                    onClick={handleRejectOffer}
                    type="button"
                  >
                    {assignmentAction === 'reject'
                      ? 'Rejecting'
                      : 'Reject Offer'}
                  </button>
                </div>
              </div>

              {assignmentVisibility.pendingOffer ? (
                <div className="mt-3 rounded-md border border-cyan-200 bg-cyan-50 p-3 dark:border-cyan-800 dark:bg-cyan-950/40">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-cyan-800 dark:bg-cyan-900 dark:text-cyan-100">
                      PENDING
                    </span>
                    <span className="text-xs font-semibold text-cyan-900 dark:text-cyan-100">
                      {formatCountdown(
                        assignmentVisibility.pendingOffer.expiresAt,
                        countdownNow,
                      )}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-slate-700 dark:text-slate-200 sm:grid-cols-2">
                    <div className="min-w-0">
                      <p className="font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                        Offer
                      </p>
                      <p className="truncate font-mono">
                        {assignmentVisibility.pendingOffer.id}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                        Offered Tanker
                      </p>
                      <p className="truncate font-mono">
                        {assignmentVisibility.pendingOffer.tankerId}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                        Score
                      </p>
                      <p className="truncate">
                        {assignmentVisibility.pendingOffer.score ?? 'Not scored'}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                        Created
                      </p>
                      <p className="truncate">
                        {formatDateTime(assignmentVisibility.pendingOffer.createdAt)}
                      </p>
                    </div>
                  </div>
                  {assignmentVisibility.pendingOffer.reason ? (
                    <p className="mt-2 text-xs text-slate-700 dark:text-slate-200">
                      {assignmentVisibility.pendingOffer.reason}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="mt-3 rounded-md bg-slate-50 dark:bg-slate-950 p-3 text-sm text-slate-600 dark:text-slate-300">
                  {hasAssignmentActivity
                    ? 'No pending assignment offer is visible for this delivery.'
                    : 'No assignment offers or decisions are visible for this delivery.'}
                </div>
              )}

              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-md bg-slate-50 dark:bg-slate-950 p-3">
                  <p className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                    Retry Count
                  </p>
                  <p className="mt-1 font-semibold text-slate-950 dark:text-slate-50">
                    {assignmentVisibility.retryCount ?? 'Not available'}
                  </p>
                </div>
                <div className="rounded-md bg-slate-50 dark:bg-slate-950 p-3">
                  <p className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                    Last Decision
                  </p>
                  {assignmentVisibility.lastDecision ? (
                    <>
                      <p className="mt-1 font-semibold text-slate-950 dark:text-slate-50">
                        {assignmentVisibility.lastDecision.result}
                      </p>
                      <p className="mt-1 truncate font-mono text-xs text-slate-600 dark:text-slate-300">
                        {assignmentVisibility.lastDecision.tankerId ??
                          'No tanker'}
                      </p>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                        Score:{' '}
                        {assignmentVisibility.lastDecision.score ?? 'Not scored'}
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-slate-600 dark:text-slate-300">Not available</p>
                  )}
                </div>
              </div>

              {assignmentVisibility.offerHistory.length > 0 ? (
                <div className="mt-4">
                  <h4 className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                    Offer History
                  </h4>
                  <div className="mt-2 flex flex-col gap-2">
                    {assignmentVisibility.offerHistory.map((item) => (
                        <div className="rounded-md bg-slate-50 dark:bg-slate-950 p-3" key={item.key}>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-white dark:bg-slate-900 px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
                              {item.status ?? item.type}
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {formatDateTime(item.createdAt)}
                            </span>
                          </div>
                          <p className="mt-2 truncate font-mono text-xs text-slate-700 dark:text-slate-200">
                            Offer: {item.id ?? 'Unknown'}
                          </p>
                          <p className="mt-1 truncate font-mono text-xs text-slate-700 dark:text-slate-200">
                            Tanker: {item.tankerId ?? 'Unknown'}
                          </p>
                          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                            Score: {item.score ?? 'Not scored'}
                          </p>
                          {item.respondedAt ? (
                            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                              Responded: {formatDateTime(item.respondedAt)}
                            </p>
                          ) : null}
                          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                            Actor: {item.actor ?? 'Assignment engine'}
                          </p>
                        </div>
                      ))}
                  </div>
                </div>
              ) : null}

              {assignmentVisibility.assignmentDecisions.length > 0 ? (
                <div className="mt-4">
                  <h4 className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                    Assignment Decisions
                  </h4>
                  <div className="mt-2 flex flex-col gap-2">
                    {assignmentVisibility.assignmentDecisions.map((decision) => (
                      <div
                        className="rounded-md bg-slate-50 dark:bg-slate-950 p-3"
                        key={decision.id}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                            {decision.result}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {formatDateTime(decision.createdAt)}
                          </span>
                        </div>
                        <p className="mt-2 truncate font-mono text-xs text-slate-700 dark:text-slate-200">
                          Tanker: {decision.tankerId ?? 'No tanker'}
                        </p>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                          Score: {decision.score ?? 'Not scored'}
                        </p>
                        {decision.reason ? (
                          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                            {decision.reason}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>

            <section className="rounded-md border border-slate-200 dark:border-slate-800 p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                  Active Alerts
                </h3>
                <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {activeAlerts.length}
                </span>
              </div>
              {activeAlerts.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  No active alerts for this delivery.
                </p>
              ) : (
                <div className="mt-3 flex flex-col gap-2">
                  {activeAlerts.map((alert) => (
                    <div
                      className="rounded-md bg-slate-50 dark:bg-slate-950 p-3"
                      key={getAlertKey(alert)}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
                          {alert.severity}
                        </span>
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                          {alert.type}
                        </span>
                      </div>
                      {'message' in alert ? (
                        <p className="mt-2 text-sm text-slate-800 dark:text-slate-100">
                          {alert.message}
                        </p>
                      ) : null}
                      {'createdAt' in alert ? (
                        <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                          Created {formatDateTime(alert.createdAt)}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-md border border-slate-200 dark:border-slate-800 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                Latest Event
              </h3>
              {data.latestEvent ? (
                <div className="mt-3 rounded-md bg-slate-50 dark:bg-slate-950 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white dark:bg-slate-900 px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
                      {data.latestEvent.type}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {formatDateTime(data.latestEvent.createdAt)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                    Actor: {data.latestEvent.actorType} /{' '}
                    {data.latestEvent.actorId ?? 'none'}
                  </p>
                  <pre className="mt-3 max-h-44 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-50">
                    {formatJson(data.latestEvent.metadata)}
                  </pre>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  No latest event recorded.
                </p>
              )}
            </section>

            <section className="rounded-md border border-slate-200 dark:border-slate-800 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                Risk Flags
              </h3>
              {data.riskFlags.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  No risk flags currently detected.
                </p>
              ) : (
                <div className="mt-3 flex flex-col gap-2">
                  {data.riskFlags.map((flag) => (
                    <div
                      className="rounded-md bg-slate-50 dark:bg-slate-950 p-3"
                      key={`${flag.type}-${flag.message}`}
                    >
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {flag.severity} / {flag.type}
                      </p>
                      <p className="mt-1 text-sm text-slate-800 dark:text-slate-100">
                        {flag.message}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <DeliveryTimelinePanel
              error={timeline.error}
              loading={timeline.loading}
              timeline={timeline.data}
            />
          </div>
        ) : null}
      </div>
    </aside>
  )
}
