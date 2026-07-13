<script setup lang="ts">
import type { EmailOtpType } from '@supabase/supabase-js'

const route = useRoute()
const user = useUserStore()

const verifyingOtp = ref(true)
const verifyError = ref<string | null>(null)
const verificationSucceeded = ref(false)

function showVerificationError() {
	verifyError.value = 'This confirmation link is invalid or has expired.'
	verifyingOtp.value = false
}

onMounted(async () => {
	const token_hash = route.query.token_hash as string | undefined
	const type = route.query.type as string | undefined

	if (!token_hash || !type) {
		showVerificationError()
		return
	}

	const validTypes: EmailOtpType[] = [
		'signup',
		'invite',
		'magiclink',
		'recovery',
		'email_change',
		'email'
	]
	if (!validTypes.includes(type as EmailOtpType)) {
		showVerificationError()
		return
	}

	const verified = await user.verifyOtp(token_hash, type as EmailOtpType)
	if (!verified) {
		showVerificationError()
		return
	}

	verificationSucceeded.value = true
	verifyingOtp.value = false
})
</script>

<template>
	<div class="mx-auto max-w-md space-y-4 p-4">
		<StateLoading
			v-if="verifyingOtp"
			message="Verifying confirmation link..."
		/>
		<StateLoading
			v-else-if="verificationSucceeded"
			message="Confirmation successful. Redirecting..."
		/>
		<div v-else-if="verifyError" class="space-y-4">
			<NoticeError class="items-start">
				<div class="space-y-1">
					<p class="font-medium">{{ verifyError }}</p>
					<p>Return to login and request a new link if needed.</p>
				</div>
			</NoticeError>
			<Button class="w-full" as-child>
				<NuxtLink to="/login">Back to login</NuxtLink>
			</Button>
		</div>
	</div>
</template>
