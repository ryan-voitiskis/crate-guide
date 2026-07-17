import {
	type DiscogsErrorCode,
	type DiscogsFolderResponse,
	type DiscogsFoldersResponse,
	type DiscogsReleaseFull,
	type DiscogsRequestContext,
	isDiscogsFolderResponse,
	isDiscogsFoldersResponse,
	isDiscogsReleaseFull
} from '../../shared/types/discogs'
import {
	DiscogsApiError,
	createDiscogsRequestContext,
	isDiscogsErrorPayload
} from '../utils/discogs-errors'

type DispatchBody =
	| { endpoint: 'folders' }
	| {
			endpoint: 'folder_releases'
			folder_id: number
			page: number
			per_page: number
	  }
	| { endpoint: 'release'; release_id: number }

type DispatchRequest = DispatchBody & {
	request_context: {
		request_id: string
		attempt: number
	}
}

const EDGE_FUNCTION_TIMEOUT_MS = 20_000

function fallbackErrorForStatus(status: number | undefined): {
	message: string
	code: DiscogsErrorCode
	retryable: boolean
} {
	if (status === 401) {
		return {
			message: 'Reconnect Discogs before trying again.',
			code: 'discogs_connection_required',
			retryable: false
		}
	}
	if (status === 404) {
		return {
			message: 'Discogs could not find this release.',
			code: 'discogs_not_found',
			retryable: false
		}
	}
	if (status === 408) {
		return {
			message: 'Discogs took too long to respond.',
			code: 'discogs_timeout',
			retryable: true
		}
	}
	if (status === 425 || status === 429) {
		return {
			message: 'Discogs is receiving too many requests. Retrying shortly.',
			code: 'discogs_rate_limited',
			retryable: true
		}
	}
	if (status !== undefined && status >= 500) {
		return {
			message: 'Discogs is temporarily unavailable.',
			code: 'discogs_unavailable',
			retryable: true
		}
	}
	return {
		message: 'Discogs could not complete the request.',
		code: 'discogs_request_rejected',
		retryable: false
	}
}

async function readStructuredError(response: unknown) {
	if (!(response instanceof Response)) return null
	try {
		const payload: unknown = await response.clone().json()
		return isDiscogsErrorPayload(payload) ? payload : null
	} catch {
		return null
	}
}

export function useDiscogsApi() {
	const supabase = getSupabase()
	const user = useUserStore()

	const invokeDispatcher = async (
		body: DispatchBody,
		context: DiscogsRequestContext = createDiscogsRequestContext()
	): Promise<{ data: unknown; requestId: string }> => {
		const request: DispatchRequest = {
			...body,
			request_context: {
				request_id: context.requestId,
				attempt: context.attempt
			}
		}
		let invocation: {
			data: unknown
			error: unknown
			response?: Response
		}
		try {
			invocation = await supabase.functions.invoke(
				'authenticated-discogs-request',
				{ body: request, timeout: EDGE_FUNCTION_TIMEOUT_MS }
			)
		} catch {
			throw new DiscogsApiError(
				'Could not reach Discogs. Check your connection.',
				{
					code: 'discogs_transport',
					retryable: true,
					requestId: context.requestId
				}
			)
		}
		const { data, error, response } = invocation
		if (error) {
			const structuredError = await readStructuredError(response)
			if (structuredError) {
				throw new DiscogsApiError(structuredError.error, {
					code: structuredError.code,
					retryable: structuredError.retryable,
					status: response?.status,
					retryAfterMs: structuredError.retry_after_ms,
					requestId: structuredError.request_id
				})
			}

			if (!response) {
				const functionError = error as {
					name?: unknown
					context?: { name?: unknown }
				}
				const timedOut =
					functionError?.name === 'FunctionsFetchError' &&
					functionError?.context?.name === 'AbortError'
				throw new DiscogsApiError(
					timedOut
						? 'The Discogs request timed out.'
						: 'Could not reach Discogs. Check your connection.',
					{
						code: timedOut ? 'discogs_timeout' : 'discogs_transport',
						retryable: true,
						requestId: context.requestId
					}
				)
			}

			const fallback = fallbackErrorForStatus(response.status)
			throw new DiscogsApiError(fallback.message, {
				code: fallback.code,
				retryable: fallback.retryable,
				status: response.status,
				requestId: context.requestId
			})
		}
		return { data, requestId: context.requestId }
	}

	const decodeResponse = <T>(
		data: unknown,
		isExpectedResponse: (value: unknown) => value is T,
		endpoint: string,
		requestId: string
	): T => {
		if (!isExpectedResponse(data)) {
			throw new DiscogsApiError(
				`Discogs returned an invalid ${endpoint} response.`,
				{
					code: 'invalid_upstream_response',
					retryable: false,
					requestId
				}
			)
		}
		return data
	}

	const getFolders = async (): Promise<DiscogsFoldersResponse> => {
		if (!user.profile?.discogs_username) {
			throw new Error('Discogs username required.')
		}
		const { data, requestId } = await invokeDispatcher({ endpoint: 'folders' })
		return decodeResponse(data, isDiscogsFoldersResponse, 'folders', requestId)
	}

	const getFolderReleases = async (
		folderId: number,
		page = 1,
		perPage = 100
	): Promise<DiscogsFolderResponse> => {
		if (!user.profile?.discogs_username) {
			throw new Error('Discogs username required.')
		}
		const { data, requestId } = await invokeDispatcher({
			endpoint: 'folder_releases',
			folder_id: folderId,
			page,
			per_page: perPage
		})
		return decodeResponse(
			data,
			isDiscogsFolderResponse,
			'folder releases',
			requestId
		)
	}

	const getRelease = async (
		releaseId: number,
		context?: DiscogsRequestContext
	): Promise<DiscogsReleaseFull> => {
		const { data, requestId } = await invokeDispatcher(
			{
				endpoint: 'release',
				release_id: releaseId
			},
			context
		)
		return decodeResponse(data, isDiscogsReleaseFull, 'release', requestId)
	}

	return {
		getFolders,
		getFolderReleases,
		getRelease
	}
}
