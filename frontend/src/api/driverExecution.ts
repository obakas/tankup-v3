import { apiRequest } from './client'
import type {
  ActorType,
  DriverExecutionInput,
  DriverExecutionResponse,
  JsonValue,
} from '../types/delivery'

type DriverActorPayload = {
  actorId?: string
  actorType?: ActorType
}

type DriverMeasurementPayload = DriverActorPayload & {
  measurement?: Record<string, JsonValue>
  metadata?: Record<string, JsonValue>
}

type DriverOtpPayload = DriverActorPayload & {
  otpCode: string
}

type DriverReasonPayload = DriverActorPayload & {
  reason: string
  metadata?: Record<string, JsonValue>
}

const postDriverAction = (
  deliveryId: string,
  action: string,
  payload: DriverExecutionInput,
) =>
  apiRequest<Extract<DriverExecutionResponse, { success: true }>>(
    `/dev/deliveries/${encodeURIComponent(deliveryId)}/driver/${action}`,
    {
      method: 'POST',
      body: payload,
    },
  ) as Promise<DriverExecutionResponse>

export const startLoading = (deliveryId: string, payload: DriverActorPayload) =>
  postDriverAction(deliveryId, 'start-loading', payload)

export const startRoute = (deliveryId: string, payload: DriverActorPayload) =>
  postDriverAction(deliveryId, 'start-route', payload)

export const arrive = (deliveryId: string, payload: DriverActorPayload) =>
  postDriverAction(deliveryId, 'arrive', payload)

export const startMeasuring = (deliveryId: string, payload: DriverActorPayload) =>
  postDriverAction(deliveryId, 'start-measuring', payload)

export const submitMeasurement = (
  deliveryId: string,
  payload: DriverMeasurementPayload,
) => postDriverAction(deliveryId, 'submit-measurement', payload)

export const requestOtp = (deliveryId: string, payload: DriverActorPayload) =>
  postDriverAction(deliveryId, 'request-otp', payload)

export const confirmOtp = (deliveryId: string, payload: DriverOtpPayload) =>
  postDriverAction(deliveryId, 'confirm-otp', payload)

export const completeDelivery = (
  deliveryId: string,
  payload: DriverActorPayload,
) => postDriverAction(deliveryId, 'complete', payload)

export const failDelivery = (deliveryId: string, payload: DriverReasonPayload) =>
  postDriverAction(deliveryId, 'fail', payload)

export const skipDelivery = (deliveryId: string, payload: DriverReasonPayload) =>
  postDriverAction(deliveryId, 'skip', payload)
