<script setup lang="ts">
import {
	buildLoginRedirectPath,
	buildSignupRedirectPath,
	sanitizeAuthReturnPath
} from '../../utils/authRoutes'

definePageMeta({ layout: 'auth' })

const route = useRoute()
const user = useUserStore()
const returnPath = computed(() => sanitizeAuthReturnPath(route.query.redirect))
const loginPath = computed(() => buildLoginRedirectPath(returnPath.value))
const signupPath = computed(() => buildSignupRedirectPath(returnPath.value))
const pendingSignup = computed(() => {
	const pending = user.pendingSignup
	return pending?.returnPath === returnPath.value ? pending : null
})
const maskedEmail = computed(() =>
	pendingSignup.value ? maskEmailAddress(pendingSignup.value.email) : null
)
const resendSucceeded = ref(false)

useHead({ title: 'Check your inbox · Crate Guide' })
user.clearAuthFeedback?.('signup-confirmation-resend')

async function resendConfirmation() {
	resendSucceeded.value = false
	resendSucceeded.value = await user.resendSignupConfirmation()
}

function useAnotherEmail() {
	user.clearPendingSignup()
}
</script>

<template>
	<ShellAuth
		chip="Intermission · Awaiting cue"
		title="Check your inbox"
		subtitle="Click the confirmation link we just sent to finish creating your account."
		catalog="CG · A02b"
	>
		<div class="grid gap-4">
			<PanelAuthStatus
				tone="pending"
				eyebrow="Email verification"
				title="Your account is waiting for confirmation."
				:description="
					maskedEmail
						? `We sent the confirmation link to ${maskedEmail}. Check spam or junk if it does not arrive.`
						: 'This page no longer has the email needed to resend safely. Return to sign up to request a new confirmation.'
				"
			/>

			<template v-if="pendingSignup">
				<ButtonLoading
					class="w-full"
					variant="outline"
					:loading="user.isResendingSignupConfirmation"
					@click="resendConfirmation"
				>
					Resend confirmation
				</ButtonLoading>
				<PanelAuthStatus
					v-if="resendSucceeded"
					tone="positive"
					eyebrow="Confirmation resent"
					title="A new confirmation email is on its way."
				/>
				<PanelAuthStatus
					v-if="user.authFeedback?.['signup-confirmation-resend']"
					tone="error"
					eyebrow="Resend unavailable"
					:title="user.authFeedback['signup-confirmation-resend']"
				/>
				<Button variant="link" as-child>
					<NuxtLink :to="signupPath" @click="useAnotherEmail">
						Use another email
					</NuxtLink>
				</Button>
			</template>
			<Button v-else class="hover:bg-primary w-full" as-child>
				<NuxtLink :to="signupPath">Return to sign up</NuxtLink>
			</Button>

			<Separator class="my-1" />

			<div class="text-center text-sm">
				<span class="text-muted-foreground">Already confirmed?</span>
				<Button variant="link" as-child>
					<NuxtLink :to="loginPath">Log in</NuxtLink>
				</Button>
			</div>
		</div>
	</ShellAuth>
</template>
