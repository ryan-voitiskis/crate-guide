import { toast } from 'vue-sonner'

const defaultOAuthErrorMessage =
	'Failed to authenticate with Discogs. Please try again.'

export const useDiscogsAuthStore = defineStore('discogsAuth', () => {
	const user = useUserStore()
	const discogs = useDiscogsStore()

	const supabase = useSupabaseClient<Database>()

	const isDiscogsConnecting = ref(false)
	const oAuthCompletionFailed = ref(false)
	const oAuthCompletionError = ref<string | null>(null)

	const isOAuthed = computed((): boolean => {
		return Boolean(
			user.profile?.discogs_access_secret && user.profile.discogs_access_token
		)
	})

	async function initDiscogsOAuthFlow() {
		isDiscogsConnecting.value = true
		const { data, error } = await supabase.functions.invoke(
			'get-discogs-request-token'
		)
		if (error) {
			isDiscogsConnecting.value = false
			toast.error('Error authenticating with Discogs.')
		} else if (data)
			window.location.href = `https://discogs.com/oauth/authorize?oauth_token=${data}`
	}

	async function completeDiscogsOAuth(): Promise<boolean> {
		oAuthCompletionFailed.value = false
		oAuthCompletionError.value = null
		const route = useRoute()
		const oauth_token = route.query.oauth_token as string
		const oauth_verifier = route.query.oauth_verifier as string
		if (!oauth_token || !oauth_verifier) {
			oAuthCompletionFailed.value = true
			oAuthCompletionError.value =
				'Missing OAuth callback parameters from Discogs.'
			return false
		}

		const { error } = await supabase.functions.invoke(
			'get-discogs-access-token',
			{ body: { oauth_token, oauth_verifier } }
		)

		if (error) {
			oAuthCompletionFailed.value = true
			oAuthCompletionError.value = await getOAuthErrorMessage(error)
			return false
		} else {
			if (await user.fetchProfile()) discogs.showGetFoldersDialog = true
			await navigateTo('/records')
			return true
		}
	}

	async function getOAuthErrorMessage(error: unknown): Promise<string> {
		let rawMessage: string | null = null
		const context = (error as { context?: unknown })?.context
		if (context instanceof Response) {
			try {
				const payload = await context.clone().json()
				if (
					payload &&
					typeof payload === 'object' &&
					'error' in payload &&
					typeof payload.error === 'string'
				) {
					rawMessage = payload.error
				}
			} catch {
				// Intentionally ignore JSON parsing failures and fall back to text parsing.
			}
			try {
				const text = await context.text()
				if (!rawMessage && text) rawMessage = text
			} catch {
				// Intentionally ignore text parsing failures and fall back to error.message.
			}
		}

		if (!rawMessage && error instanceof Error && error.message) {
			rawMessage = error.message
		}
		return sanitizeOAuthErrorMessage(rawMessage)
	}

	function sanitizeOAuthErrorMessage(rawMessage: string | null): string {
		if (!rawMessage) return defaultOAuthErrorMessage

		const message = rawMessage.replace(/\s+/g, ' ').trim()
		if (!message) return defaultOAuthErrorMessage
		if (message.length > 220) return defaultOAuthErrorMessage
		if (containsSensitiveOAuthData(message)) return defaultOAuthErrorMessage

		return message
	}

	function containsSensitiveOAuthData(message: string): boolean {
		return [
			/oauth_(token|signature|nonce|verifier|consumer|secret)/i,
			/\b(access|refresh)_token\b/i,
			/[?&](oauth_token|oauth_verifier|oauth_signature)=/i,
			/\bauthorization:\s*bearer\b/i
		].some((pattern) => pattern.test(message))
	}

	return {
		isDiscogsConnecting,
		isOAuthed,
		oAuthCompletionFailed,
		oAuthCompletionError,
		initDiscogsOAuthFlow,
		completeDiscogsOAuth
	}
})
