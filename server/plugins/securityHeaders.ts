import {
	getRequestProtocol,
	getResponseHeader,
	removeResponseHeader,
	setResponseHeaders
} from 'h3'
import { defineNitroPlugin } from 'nitropack/runtime'
import { createBrowserSecurityHeaders } from '../../shared/security/browserHeaders'

export default defineNitroPlugin((nitroApp) => {
	nitroApp.hooks.hook('beforeResponse', async (event, response) => {
		const contentType = getResponseHeader(event, 'content-type')
		const htmlBody = typeof response.body === 'string' ? response.body : null
		const runtimeConfig = useRuntimeConfig(event)
		const platformRequest = (
			event.context as {
				_platform?: { cloudflare?: { request?: Request } }
			}
		)._platform?.cloudflare?.request
		const requestProtocol = platformRequest
			? new URL(platformRequest.url).protocol.replace(':', '')
			: event.web?.request
				? new URL(event.web.request.url).protocol.replace(':', '')
				: getRequestProtocol(event)
		const headers = await createBrowserSecurityHeaders({
			contentType: typeof contentType === 'string' ? contentType : null,
			htmlBody,
			isHttps: requestProtocol === 'https',
			supabaseOrigin: runtimeConfig.browserSecurity.supabaseOrigin
		})

		removeResponseHeader(event, 'x-powered-by')
		setResponseHeaders(event, headers)
	})
})
