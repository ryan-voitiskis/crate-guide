import {
	type AccountCoverCleanupResult,
	processOneAccountCoverCleanup
} from '../_shared/accountCoverCleanup.ts'
import { requireEnv } from '../_shared/supabaseHelpers.ts'

interface HandlerDependencies {
	serviceRoleKey(): string
	compareSecrets(actual: string, expected: string): Promise<boolean>
	processOne(): Promise<AccountCoverCleanupResult>
}

const defaultDependencies: HandlerDependencies = {
	serviceRoleKey: () => requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
	compareSecrets: timingSafeSecretEqual,
	processOne: () => processOneAccountCoverCleanup()
}

function jsonResponse(
	body: unknown,
	headers: HeadersInit,
	status: number
): Response {
	return new Response(JSON.stringify(body), { headers, status })
}

function getExactBearerToken(authHeader: string | null): string {
	return /^Bearer ([^\s]+)$/.exec(authHeader ?? '')?.[1] ?? ''
}

export async function timingSafeSecretEqual(
	actual: string,
	expected: string
): Promise<boolean> {
	const encoder = new TextEncoder()
	const [actualDigest, expectedDigest] = await Promise.all([
		crypto.subtle.digest('SHA-256', encoder.encode(actual)),
		crypto.subtle.digest('SHA-256', encoder.encode(expected))
	])
	const actualBytes = new Uint8Array(actualDigest)
	const expectedBytes = new Uint8Array(expectedDigest)
	let difference = 0
	for (let index = 0; index < actualBytes.length; index += 1) {
		difference |= actualBytes[index]! ^ expectedBytes[index]!
	}
	return difference === 0
}

export function createCleanupOrphanedRecordCoversHandler(
	headers: HeadersInit,
	dependencies: HandlerDependencies = defaultDependencies
): (request: Request) => Promise<Response> {
	return async (request) => {
		if (request.method !== 'POST') {
			return jsonResponse(
				{ error: 'Method not allowed.', code: 'method_not_allowed' },
				headers,
				405
			)
		}

		let isServiceRole = false
		try {
			isServiceRole = await dependencies.compareSecrets(
				getExactBearerToken(request.headers.get('Authorization')),
				dependencies.serviceRoleKey()
			)
		} catch {
			return jsonResponse(
				{ error: 'Cleanup service unavailable.', code: 'service_unavailable' },
				headers,
				503
			)
		}
		if (!isServiceRole) {
			return jsonResponse(
				{ error: 'Authentication required.', code: 'authentication_required' },
				headers,
				401
			)
		}

		if ((await request.text()).trim()) {
			return jsonResponse(
				{ error: 'Request body is not allowed.', code: 'invalid_request' },
				headers,
				400
			)
		}

		let result: AccountCoverCleanupResult
		try {
			result = await dependencies.processOne()
		} catch {
			result = { processed: false, complete: false, failed: true }
		}

		return jsonResponse(
			{ processed: result.processed, complete: result.complete },
			headers,
			result.failed ? 503 : 200
		)
	}
}
