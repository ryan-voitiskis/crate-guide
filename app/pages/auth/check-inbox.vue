<script setup lang="ts">
import {
	buildLoginRedirectPath,
	sanitizeAuthReturnPath
} from '../../utils/authRoutes'

const route = useRoute()
const returnPath = computed(() => sanitizeAuthReturnPath(route.query.redirect))
const loginPath = computed(() => buildLoginRedirectPath(returnPath.value))
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
				description="If the message does not arrive within a few minutes, check your spam or junk folder."
			/>

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
