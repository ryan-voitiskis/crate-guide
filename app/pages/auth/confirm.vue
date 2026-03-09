<script setup lang="ts">
import type { EmailOtpType } from '@supabase/supabase-js'

const route = useRoute()
const user = useUserStore()

const verifyingOtp = ref(false)
const verifyError = ref<string | null>(null)

onMounted(async () => {
	const token_hash = route.query.token_hash as string | undefined
	const type = route.query.type as string | undefined

	if (!token_hash || !type) {
		verifyError.value = 'Invalid confirmation link: missing parameters.'
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
		verifyError.value = 'Invalid confirmation link: unknown type.'
		return
	}

	verifyingOtp.value = true
	await user.verifyOtp(token_hash, type as EmailOtpType)
	verifyingOtp.value = false
})
</script>

<template>
	<div v-if="verifyError" class="text-destructive p-4">{{ verifyError }}</div>
	<div v-else-if="verifyingOtp">Verifying...</div>
</template>
