import { useCallback, useEffect, useState } from 'react'
import {
  listOperationsDeliveries,
  type OperationsDeliveriesFilters,
  type OperationsDeliveriesResponse,
} from '../services/operationsApi'

const getMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unable to load operations deliveries'

export const useOperationsDeliveries = (
  filters: OperationsDeliveriesFilters = {},
) => {
  const [data, setData] = useState<OperationsDeliveriesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadDeliveries = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      setError(null)

      try {
        const response = await listOperationsDeliveries(filters)
        setData(response)
      } catch (loadError) {
        setError(getMessage(loadError))
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [filters],
  )

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const response = await listOperationsDeliveries(filters)

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
        }
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [filters])

  return {
    deliveries: data?.deliveries ?? [],
    generatedAt: data?.generatedAt ?? null,
    appliedFilters: data?.filters ?? null,
    loading,
    refreshing,
    error,
    refetch: () => loadDeliveries(true),
  }
}
