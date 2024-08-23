<script setup lang="ts">
import type { EmailOtpType } from '@supabase/supabase-js'

const route = useRoute()
const user = useUserStore()

const verifyingOtp = ref(false)

onMounted(async () => {
	const token_hash = route.query.token_hash as string
	const type = route.query.type as EmailOtpType

	verifyingOtp.value = true
	await user.verifyOtp(token_hash, type)
	verifyingOtp.value = false
})
</script>

<template>
	<div v-if="verifyingOtp">Verifying...</div>
</template>
