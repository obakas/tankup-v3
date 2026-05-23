import { useCallback, useEffect, useState } from 'react'
import {
  getDeliveryTimeline,
  type DeliveryTimeline,
} from '../services/operationsApi'

const getMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unable to load delivery timeline'

export const useDeliveryTimeline = (deliveryId: string | null) => {
  const [data, setData] = useState<DeliveryTimeline | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!deliveryId) {
      setData(null)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await getDeliveryTimeline(deliveryId)
      setData(response)
    } catch (loadError) {
      setError(getMessage(loadError))
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [deliveryId])

  useEffect(() => {
    let active = true

    const load = async () => {
      if (!deliveryId) {
        setData(null)
        setError(null)
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const response = await getDeliveryTimeline(deliveryId)

        if (active) {
          setData(response)
        }
      } catch (loadError) {
        if (active) {
          setError(getMessage(loadError))
          setData(null)
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [deliveryId])

  return { data, loading, error, refetch }
}
