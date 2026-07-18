<script setup lang="ts">
import type { EmailOtpType } from '@supabase/supabase-js'
import {
	buildLoginRedirectPath,
	sanitizeAuthReturnPath
} from '../../utils/authRoutes'

definePageMeta({ layout: 'auth' })

const route = useRoute()
const user = useUserStore()

const verifyingOtp = ref(true)
const verifyError = ref<string | null>(null)
const verificationSucceeded = ref(false)
const returnPath = computed(() => sanitizeAuthReturnPath(route.query.redirect))
const loginPath = computed(() => buildLoginRedirectPath(returnPath.value))

const validTypes: EmailOtpType[] = [
	'signup',
	'invite',
	'magiclink',
	'recovery',
	'email_change',
	'email'
]

const purpose = computed(() => {
	const type = route.query.type
	if (type === 'recovery')
		return {
			title: 'Verify recovery',
			pending: 'Verifying password recovery link...',
			success: 'Recovery verified. Opening password update...'
		}
	if (type === 'invite')
		return {
			title: 'Accept invitation',
			pending: 'Verifying invitation...',
			success: 'Invitation accepted. Redirecting...'
		}
	if (type === 'email_change')
		return {
			title: 'Verify email change',
			pending: 'Verifying email change...',
			success: 'Email change verified. Redirecting...'
		}
	if (type === 'magiclink' || type === 'email')
		return {
			title: 'Verify sign in',
			pending: 'Verifying sign-in link...',
			success: 'Sign in verified. Redirecting...'
		}
	return {
		title: 'Confirm account',
		pending: 'Verifying account confirmation...',
		success: 'Account confirmed. Redirecting...'
	}
})

function showVerificationError() {
	verifyError.value = 'This confirmation link is invalid or has expired.'
	verifyingOtp.value = false
}

onMounted(async () => {
	const token_hash = route.query.token_hash as string | undefined
	const type = route.query.type as string | undefined

	if (!token_hash || !type || !validTypes.includes(type as EmailOtpType)) {
		showVerificationError()
		return
	}

	const verified = await user.verifyOtp(
		token_hash,
		type as EmailOtpType,
		returnPath.value
	)
	if (!verified) {
		showVerificationError()
		return
	}

	verificationSucceeded.value = true
	verifyingOtp.value = false
})
</script>

<template>
	<ShellAuth
		chip="Access cue · Verification"
		:title="purpose.title"
		catalog="CG · A03"
		context-title="Single-use verification"
		context-description="Crate Guide validates the operation encoded in your email link before opening any account surface."
	>
		<PanelAuthStatus
			v-if="verifyingOtp"
			tone="pending"
			eyebrow="Verification in progress"
			:title="purpose.pending"
			description="Keep this page open while the secure callback completes."
		/>
		<PanelAuthStatus
			v-else-if="verificationSucceeded"
			tone="positive"
			eyebrow="Verification complete"
			:title="purpose.success"
		/>
		<div v-else-if="verifyError" class="grid gap-4">
			<PanelAuthStatus
				tone="error"
				eyebrow="Verification unavailable"
				:title="verifyError"
				description="Return to login and request a new link if needed."
			/>
			<Button class="w-full" as-child>
				<NuxtLink :to="loginPath">Back to login</NuxtLink>
			</Button>
		</div>
	</ShellAuth>
</template>
