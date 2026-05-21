import type { ApiError, ApiErrorCode, ApiSuccess } from '../types/delivery'

const fallbackApiBaseUrl = 'http://localhost:5000'

const getApiBaseUrl = () =>
  (import.meta.env.VITE_API_BASE_URL || fallbackApiBaseUrl).replace(/\/+$/, '')

type ApiRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  headers?: HeadersInit
}

const apiErrorCodes = new Set<ApiErrorCode>([
  'VALIDATION_ERROR',
  'DELIVERY_NOT_FOUND',
  'INVALID_DELIVERY_TRANSITION',
  'DELIVERY_TRANSITION_ACTOR_FORBIDDEN',
  'DELIVERY_TRANSITION_ACTOR_ID_REQUIRED',
  'DELIVERY_TRANSITION_REASON_REQUIRED',
  'DELIVERY_TRANSITION_CONFLICT',
  'DELIVERY_COMPLETION_REQUIRES_VERIFIED_OTP',
  'DELIVERY_OTP_INVALID_STATUS',
  'DELIVERY_OTP_EXPIRED',
  'DELIVERY_OTP_INVALID',
  'INTERNAL_SERVER_ERROR',
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const normalizeCode = (code: unknown): ApiErrorCode =>
  typeof code === 'string' && apiErrorCodes.has(code as ApiErrorCode)
    ? (code as ApiErrorCode)
    : 'INTERNAL_SERVER_ERROR'

const normalizeDetails = (details: unknown): Record<string, unknown> =>
  isRecord(details) ? details : {}

const normalizeApiError = (
  value: unknown,
  status?: number,
  fallbackMessage = 'Request failed',
): ApiError => {
  if (isRecord(value)) {
    return {
      success: false,
      error:
        typeof value.error === 'string'
          ? value.error
          : typeof value.message === 'string'
            ? value.message
            : fallbackMessage,
      code: normalizeCode(value.code),
      details: {
        ...normalizeDetails(value.details),
        ...(status ? { status } : {}),
      },
    }
  }

  return {
    success: false,
    error: fallbackMessage,
    code: 'INTERNAL_SERVER_ERROR',
    details: status ? { status } : {},
  }
}

const parseJson = async (response: Response): Promise<unknown> => {
  const text = await response.text()

  if (!text) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export const apiRequest = async <TSuccess extends ApiSuccess<unknown>>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<TSuccess | ApiError> => {
  try {
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...options.headers,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })

    const data = await parseJson(response)

    if (!response.ok) {
      return normalizeApiError(data, response.status)
    }

    if (isRecord(data) && data.success === true) {
      return data as TSuccess
    }

    if (isRecord(data) && data.success === false) {
      return normalizeApiError(data, response.status)
    }

    return normalizeApiError(data, response.status, 'Unexpected API response')
  } catch (error) {
    return {
      success: false,
      error: 'Network request failed',
      code: 'INTERNAL_SERVER_ERROR',
      details: {
        message: error instanceof Error ? error.message : String(error),
      },
    }
  }
}
