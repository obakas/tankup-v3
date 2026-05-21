export type ActorType =
  | 'CUSTOMER'
  | 'DRIVER'
  | 'FLEET_HEAD'
  | 'ADMIN'
  | 'SYSTEM'

export type DeliveryStatus =
  | 'CREATED'
  | 'ASSIGNED'
  | 'LOADING'
  | 'EN_ROUTE'
  | 'ARRIVED'
  | 'MEASURING'
  | 'AWAITING_OTP'
  | 'COMPLETED'
  | 'FAILED'
  | 'SKIPPED'

export type DeliveryEventType =
  | 'DELIVERY_ASSIGNED'
  | 'LOADING_STARTED'
  | 'DRIVER_EN_ROUTE'
  | 'DRIVER_ARRIVED'
  | 'MEASUREMENT_STARTED'
  | 'MEASUREMENT_COMPLETED'
  | 'DELIVERY_COMPLETED'
  | 'DELIVERY_FAILED'
  | 'DELIVERY_SKIPPED'
  | 'DELIVERY_OTP_GENERATED'
  | 'DELIVERY_OTP_VERIFIED'
  | 'DELIVERY_OTP_FAILED'
  | 'DELIVERY_ALERT_CREATED'

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

export type Delivery = {
  id: string
  status: DeliveryStatus
  customerId: string | null
  driverId: string | null
  tankerId: string | null
  siteId: string | null
  otpCode?: string | null
  otpExpiresAt?: string | null
  otpVerifiedAt: string | null
  otpVerifiedByActorType?: ActorType | null
  otpVerifiedByActorId?: string | null
  otpAttemptCount: number
  createdAt: string
  updatedAt: string
}

export type DeliveryEvent = {
  id: string
  deliveryId: string
  type: DeliveryEventType | string
  actorType: ActorType
  actorId: string | null
  metadata: JsonValue
  createdAt: string
}

export type ApiSuccess<T> = {
  success: true
  message: string
  delivery: Delivery
  event: DeliveryEvent | null
  metadata: T
}

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'DELIVERY_NOT_FOUND'
  | 'INVALID_DELIVERY_TRANSITION'
  | 'DELIVERY_TRANSITION_ACTOR_FORBIDDEN'
  | 'DELIVERY_TRANSITION_ACTOR_ID_REQUIRED'
  | 'DELIVERY_TRANSITION_REASON_REQUIRED'
  | 'DELIVERY_TRANSITION_CONFLICT'
  | 'DELIVERY_COMPLETION_REQUIRES_VERIFIED_OTP'
  | 'DELIVERY_OTP_INVALID_STATUS'
  | 'DELIVERY_OTP_EXPIRED'
  | 'DELIVERY_OTP_INVALID'
  | 'INTERNAL_SERVER_ERROR'

export type ApiError = {
  success: false
  error: string
  code: ApiErrorCode
  details: Record<string, unknown>
}

export type DriverExecutionMetadata = {
  targetStatus?: DeliveryStatus
  actorType?: ActorType
  actorId?: string | null
  reason?: string
  metadata?: Record<string, JsonValue>
  measurement?: Record<string, JsonValue> | null
  otpCode?: string
}

export type DriverExecutionResponse =
  | ApiSuccess<DriverExecutionMetadata | null>
  | ApiError

export type DriverExecutionInput = {
  actorId?: string
  actorType?: ActorType
  reason?: string
  otpCode?: string
  metadata?: Record<string, JsonValue>
  measurement?: Record<string, JsonValue>
}
