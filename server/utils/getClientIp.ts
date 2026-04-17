// Cloudflare-aware client IP extraction.
//
// Behind Cloudflare (our target hosting platform), the only trustworthy client
// IP header is `cf-connecting-ip`, set by Cloudflare's edge and stripped of
// any client-supplied forgeries. Raw `X-Forwarded-For` can be spoofed by any
// client so we never read it. Falls back to the socket remote address when
// running outside Cloudflare (e.g. local dev).

export function getClientIp(event: unknown): string | null {
	const request = (
		event as {
			node?: {
				req?: {
					headers?: Record<string, string | string[] | undefined>
					socket?: { remoteAddress?: string | null }
				}
			}
		}
	).node?.req

	const cfConnectingIp = request?.headers?.['cf-connecting-ip']
	if (typeof cfConnectingIp === 'string' && cfConnectingIp.length > 0) {
		return cfConnectingIp
	}
	if (Array.isArray(cfConnectingIp) && typeof cfConnectingIp[0] === 'string') {
		return cfConnectingIp[0]
	}

	const remoteAddress = request?.socket?.remoteAddress
	if (typeof remoteAddress === 'string' && remoteAddress.length > 0) {
		return remoteAddress
	}

	return null
}
