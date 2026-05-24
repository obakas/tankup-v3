import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getOperationsAlerts,
  type OperationsAlertsResponse,
} from '../services/operationsApi'

const getMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unable to load operations alerts'

export const useOperationsAlerts = () => {
  const [data, setData] = useState<OperationsAlertsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  const loadAlerts = useCallback(async (isRefresh = false) => {
    if (inFlight.current) {
      return
    }

    inFlight.current = true

    if (isRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    setError(null)

    try {
      const response = await getOperationsAlerts()
      setData(response)
    } catch (loadError) {
      setError(getMessage(loadError))
    } finally {
      setLoading(false)
      setRefreshing(false)
      inFlight.current = false
    }
  }, [])

  useEffect(() => {
    let active = true

    const load = async (isRefresh = false) => {
      if (inFlight.current) {
        return
      }

      inFlight.current = true

      if (isRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      setError(null)

      try {
        const response = await getOperationsAlerts()

        if (active) {
          setData(response)
        }
      } catch (loadError) {
        if (active) {
          setError(getMessage(loadError))
        }
      } finally {
        if (active) {
          setLoading(false)
          setRefreshing(false)
        }
        inFlight.current = false
      }
    }

    void load()
    const intervalId = window.setInterval(() => {
      void load(true)
    }, 10_000)

    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [])

  return {
    alerts: data?.alerts ?? [],
    generatedAt: data?.generatedAt ?? null,
    loading,
    refreshing,
    error,
    refetch: () => loadAlerts(true),
  }
}
