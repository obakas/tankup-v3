import { apiGet, apiRequest } from '../../../api/client'
import type {
  ActorType,
  ApiSuccess,
  Delivery,
  DeliveryStatus,
  JsonValue,
} from '../../../types/delivery'

export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export type OtpState = 'NOT_GENERATED' | 'PENDING' | 'EXPIRED' | 'VERIFIED'

export type OfferStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CANCELLED'

export type AssignmentDecisionResult = 'ACCEPTED' | 'REJECTED' | 'EXPIRED'

export type DeliveryAlertCandidate = {
  deliveryId: string
  status: DeliveryStatus
  type: string
  severity: AlertSeverity
  ageMinutes: number
  message: string
  metadata: Record<string, JsonValue>
}

export type OperationsAlertsResponse = {
  generatedAt: string
  alerts: DeliveryAlertCandidate[]
}

export type OperationsEvent = {
  id: string
  type: string
  actorType: ActorType
  actorId: string | null
  metadata: JsonValue
  createdAt: string
}

export type OperationsAuditLog = {
  id: string
  action: string
  actorType: ActorType
  actorId: string | null
  reason: string | null
  metadata: JsonValue
  createdAt: string
}

export type OperationsStoredAlert = {
  id: string
  type: string
  severity: AlertSeverity
  metadata: JsonValue
  createdAt: string
}

export type OperationsRiskFlag = {
  type: string
  severity: AlertSeverity
  message: string
}

export type AssignmentPendingOffer = {
  id: string
  deliveryId: string
  tankerId: string
  score: number | null
  reason: string | null
  expiresAt: string | null
  createdAt: string
}

export type AssignmentOfferHistoryItem = {
  id: string
  tankerId: string
  status: OfferStatus
  score: number | null
  reason: string | null
  expiresAt: string | null
  respondedAt: string | null
  createdAt: string
}

export type AssignmentDecisionSummary = {
  id: string
  tankerId: string | null
  score: number | null
  result: AssignmentDecisionResult
  reason: string | null
  createdAt: string
}

export type AssignmentVisibility = {
  pendingOffer: AssignmentPendingOffer | null
  offerHistory: AssignmentOfferHistoryItem[]
  assignmentDecisions: AssignmentDecisionSummary[]
  retryCount: number
  lastAssignmentDecision: AssignmentDecisionSummary | null
}

export type AssignmentActorPayload = {
  actorType?: ActorType
  actorId?: string
  reason?: string
}

export type RunAssignmentPayload = AssignmentActorPayload & {
  deliveryId: string
  expiresInMinutes?: number
}

export type AssignmentActionResponse = ApiSuccess<null> & {
  offer?: AssignmentOfferHistoryItem
  decision?: AssignmentDecisionSummary
  delivery?: Delivery
  offerId?: string
  eventId?: string
}

export type DeliveryOperationsView = {
  delivery: {
    id: string
    status: DeliveryStatus
    customerId: string | null
    driverId: string | null
    tankerId: string | null
    siteId: string | null
  }
  currentStatusAge: {
    startedAt: string
    ageMinutes: number
  }
  latestEvent: OperationsEvent | null
  latestAuditLog: OperationsAuditLog | null
  otp: {
    state: OtpState
    expiresAt: string | null
    verifiedAt: string | null
    verifiedByActorType: ActorType | null
    verifiedByActorId: string | null
    attemptCount: number
  }
  alerts: {
    unresolved: OperationsStoredAlert[]
    candidates: DeliveryAlertCandidate[]
  }
  assignment?: AssignmentVisibility | null
  riskFlags: OperationsRiskFlag[]
  suggestedOperatorAction: string
  generatedAt: string
}

export type TimelineEntrySource = 'EVENT' | 'AUDIT' | 'NOTIFICATION'

export type DeliveryTimelineEntry = {
  timestamp: string
  source: TimelineEntrySource
  type: string
  actorType: ActorType | null
  actorId: string | null
  message: string
  metadata: JsonValue
}

export type DeliveryTimeline = {
  delivery: {
    id: string
    status: DeliveryStatus
    customerId: string | null
    driverId: string | null
    tankerId: string | null
    siteId: string | null
    otpVerifiedAt: string | null
    otpAttemptCount: number
    createdAt: string
    updatedAt: string
  }
  timeline: DeliveryTimelineEntry[]
}

export type OperationsDeliveryListItem = {
  id: string
  status: DeliveryStatus
  identifiers: {
    customerId: string | null
    orderId: string | null
    requestId: string | null
    driverId: string | null
    tankerId: string | null
    siteId: string | null
  }
  volumeLitres: number | null
  createdAt: string
  updatedAt: string
  lastEvent: OperationsEvent | null
  assignment?: AssignmentVisibility | null
  activeAlertsCount: number
  isDemoScenario: boolean
  demoScenarioName: string | null
}

export type OperationsDeliveriesFilters = {
  status?: DeliveryStatus
  limit?: number
  search?: string
}

export type OperationsDeliveriesResponse = {
  generatedAt: string
  filters: {
    status: DeliveryStatus | null
    limit: number
    search: string | null
  }
  deliveries: OperationsDeliveryListItem[]
}

export const getOperationsAlerts = () =>
  apiGet<OperationsAlertsResponse>('/dev/operations/alerts')

export const listOperationsDeliveries = ({
  status,
  limit,
  search,
}: OperationsDeliveriesFilters = {}) => {
  const query = new URLSearchParams()

  if (status) {
    query.set('status', status)
  }

  if (limit !== undefined) {
    query.set('limit', String(limit))
  }

  if (search?.trim()) {
    query.set('search', search.trim())
  }

  const queryString = query.toString()

  return apiGet<OperationsDeliveriesResponse>(
    `/dev/operations/deliveries${queryString ? `?${queryString}` : ''}`,
  )
}

export const getDeliveryOperations = (deliveryId: string) =>
  apiGet<DeliveryOperationsView>(
    `/dev/deliveries/${encodeURIComponent(deliveryId)}/operations`,
  )

export const getDeliveryTimeline = (deliveryId: string) =>
  apiGet<DeliveryTimeline>(
    `/dev/deliveries/${encodeURIComponent(deliveryId)}/timeline`,
  )

export const runAssignment = (payload: RunAssignmentPayload) =>
  apiRequest<AssignmentActionResponse>('/dev/assignments/run', {
    method: 'POST',
    body: payload,
  })

export const getIncomingOfferForTanker = (tankerId: string) =>
  apiGet<{ success: true; offer: AssignmentOfferHistoryItem | null }>(
    `/dev/tankers/${encodeURIComponent(tankerId)}/incoming-offer`,
  )

export const acceptOffer = (
  offerId: string,
  payload: AssignmentActorPayload = {},
) =>
  apiRequest<AssignmentActionResponse>(
    `/dev/offers/${encodeURIComponent(offerId)}/accept`,
    {
      method: 'POST',
      body: payload,
    },
  )

export const rejectOffer = (
  offerId: string,
  payload: AssignmentActorPayload = {},
) =>
  apiRequest<AssignmentActionResponse>(
    `/dev/offers/${encodeURIComponent(offerId)}/reject`,
    {
      method: 'POST',
      body: payload,
    },
  )
