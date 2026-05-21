import { useCallback, useState } from 'react'
import * as driverExecutionApi from '../api/driverExecution'
import type {
  ActorType,
  ApiError,
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

export const useDriverExecution = () => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [lastResponse, setLastResponse] =
    useState<DriverExecutionResponse | null>(null)

  const runAction = useCallback(
    async (action: () => Promise<DriverExecutionResponse>) => {
      setLoading(true)
      setError(null)

      const response = await action()

      setLastResponse(response)

      if (!response.success) {
        setError(response)
      }

      setLoading(false)
      return response
    },
    [],
  )

  return {
    loading,
    error,
    lastResponse,
    startLoading: (deliveryId: string, payload: DriverActorPayload) =>
      runAction(() => driverExecutionApi.startLoading(deliveryId, payload)),
    startRoute: (deliveryId: string, payload: DriverActorPayload) =>
      runAction(() => driverExecutionApi.startRoute(deliveryId, payload)),
    arrive: (deliveryId: string, payload: DriverActorPayload) =>
      runAction(() => driverExecutionApi.arrive(deliveryId, payload)),
    startMeasuring: (deliveryId: string, payload: DriverActorPayload) =>
      runAction(() => driverExecutionApi.startMeasuring(deliveryId, payload)),
    submitMeasurement: (
      deliveryId: string,
      payload: DriverMeasurementPayload,
    ) =>
      runAction(() =>
        driverExecutionApi.submitMeasurement(deliveryId, payload),
      ),
    requestOtp: (deliveryId: string, payload: DriverActorPayload) =>
      runAction(() => driverExecutionApi.requestOtp(deliveryId, payload)),
    confirmOtp: (deliveryId: string, payload: DriverOtpPayload) =>
      runAction(() => driverExecutionApi.confirmOtp(deliveryId, payload)),
    completeDelivery: (deliveryId: string, payload: DriverActorPayload) =>
      runAction(() => driverExecutionApi.completeDelivery(deliveryId, payload)),
    failDelivery: (deliveryId: string, payload: DriverReasonPayload) =>
      runAction(() => driverExecutionApi.failDelivery(deliveryId, payload)),
    skipDelivery: (deliveryId: string, payload: DriverReasonPayload) =>
      runAction(() => driverExecutionApi.skipDelivery(deliveryId, payload)),
  }
}
