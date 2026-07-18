<script setup lang="ts">
import {
	buildLoginRedirectPath,
	sanitizeAuthReturnPath
} from '../../utils/authRoutes'

definePageMeta({ keepalive: false })

type FinalisingState =
	| 'loading'
	| 'redirecting'
	| 'callback-error'
	| 'timeout-error'

const route = useRoute()
const user = useUserStore()
const returnPath = computed(() => sanitizeAuthReturnPath(route.query.redirect))
const retryPath = computed(() => buildLoginRedirectPath(returnPath.value))
const hasCallbackError = ['error', 'error_code', 'error_description'].some(
	(key) => key in route.query
)
const state = ref<FinalisingState>(
	hasCallbackError ? 'callback-error' : 'loading'
)
let hydrationTimeout: ReturnType<typeof setTimeout> | null = null

function clearHydrationTimeout() {
	if (hydrationTimeout === null) return
	clearTimeout(hydrationTimeout)
	hydrationTimeout = null
}

onMounted(() => {
	if (state.value !== 'loading') return
	hydrationTimeout = setTimeout(() => {
		if (state.value === 'loading') state.value = 'timeout-error'
		hydrationTimeout = null
	}, 10_000)
})

onBeforeUnmount(clearHydrationTimeout)

watch(
	() => user.supaUser,
	async (newUser) => {
		if (!newUser || state.value !== 'loading') return
		clearHydrationTimeout()
		state.value = 'redirecting'
		try {
			const navigationResult = await navigateTo(returnPath.value, {
				replace: true
			})
			if (navigationResult !== undefined) state.value = 'callback-error'
		} catch {
			state.value = 'callback-error'
		}
	},
	{ immediate: true }
)
</script>

<template>
	<ShellAuth
		chip="Side A · Secure callback"
		title="Signing in"
		catalog="CG · A01"
	>
		<PanelAuthStatus
			v-if="state === 'loading'"
			tone="pending"
			eyebrow="Authentication in progress"
			title="Completing sign in..."
			description="Waiting for your authenticated session."
		/>
		<PanelAuthStatus
			v-else-if="state === 'redirecting'"
			tone="positive"
			eyebrow="Authentication complete"
			title="Sign in successful. Redirecting..."
		/>
		<div v-else class="space-y-4">
			<PanelAuthStatus
				tone="error"
				eyebrow="Authentication interrupted"
				:title="
					state === 'timeout-error'
						? 'Sign in is taking longer than expected.'
						: `We couldn't complete your sign in.`
				"
				description="Please try again or return to login."
			/>
			<div class="grid gap-3 sm:grid-cols-2">
				<Button as-child>
					<NuxtLink :to="retryPath">Try again</NuxtLink>
				</Button>
				<Button variant="outline" as-child>
					<NuxtLink to="/demo">Open demo</NuxtLink>
				</Button>
			</div>
		</div>
	</ShellAuth>
</template>
