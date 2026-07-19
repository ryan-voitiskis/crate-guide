<script setup lang="ts">
import { AlertTriangle } from 'lucide-vue-next'
import { buildLoginRedirectPath } from '../../utils/authRoutes'

const props = withDefaults(defineProps<{ openOnMount?: boolean }>(), {
	openOnMount: false
})

const user = useUserStore()
const route = useRoute()

const showDialog = ref(false)
const confirmationInput = ref('')
const isDeleting = ref(false)
const requiresRecentAuthentication = ref(false)
const isOpeningLogin = ref(false)
const reauthenticationError = ref<string | null>(null)

const accountEmail = computed(() => user.supaUser?.email ?? '')
const isConfirmed = computed(
	() =>
		Boolean(accountEmail.value) &&
		confirmationInput.value.trim().toLocaleLowerCase('en-US') ===
			accountEmail.value.trim().toLocaleLowerCase('en-US')
)

function openDialog() {
	confirmationInput.value = ''
	requiresRecentAuthentication.value = false
	reauthenticationError.value = null
	showDialog.value = true
}

async function handleDelete() {
	if (!isConfirmed.value || isDeleting.value) return

	isDeleting.value = true
	const result = await user.deleteAccount(confirmationInput.value)
	isDeleting.value = false

	if (result.status === 'deleted') showDialog.value = false
	if (result.status === 'recent-auth-required') {
		confirmationInput.value = ''
		requiresRecentAuthentication.value = true
	}
}

async function handleSignInAgain() {
	if (isOpeningLogin.value) return
	confirmationInput.value = ''
	reauthenticationError.value = null
	isOpeningLogin.value = true
	try {
		if (!(await user.signOutForReauthentication())) {
			throw new Error('Local sign out failed')
		}
		await navigateTo(
			buildLoginRedirectPath('/settings?action=delete-account'),
			{
				replace: true
			}
		)
	} catch {
		reauthenticationError.value =
			"We couldn't sign you out safely. Please try again."
	} finally {
		isOpeningLogin.value = false
	}
}

onMounted(async () => {
	if (!props.openOnMount) return
	openDialog()
	await nextTick()
	const query = { ...route.query }
	delete query.action
	try {
		await navigateTo({ query }, { replace: true })
	} catch {
		console.error('Account deletion dialog opened, but query cleanup failed')
	}
})
</script>

<template>
	<Button variant="destructive" @click="openDialog">Delete Account</Button>

	<Dialog v-model:open="showDialog">
		<DialogContent class="sm:max-w-[425px]">
			<DialogHeader>
				<DialogTitle class="flex items-center gap-2">
					<AlertTriangle class="text-destructive size-5" />
					Delete Account
				</DialogTitle>
				<DialogDescription>
					Permanently delete your account and active Crate Guide data.
				</DialogDescription>
			</DialogHeader>

			<div v-if="requiresRecentAuthentication" class="space-y-4">
				<div class="border-border bg-muted/40 rounded-lg border p-4">
					<p class="text-sm font-medium">Sign in again to continue</p>
					<p class="text-muted-foreground mt-2 text-sm">
						For your security, account deletion requires a login from the last
						five minutes. Choose an available sign-in method on the login page,
						then you will return here.
					</p>
				</div>
				<p v-if="reauthenticationError" class="text-destructive text-sm">
					{{ reauthenticationError }}
				</p>
			</div>

			<div v-else class="space-y-4">
				<div
					class="bg-destructive/10 border-destructive/20 rounded-lg border p-4"
				>
					<p class="text-destructive text-sm font-medium">
						This action cannot be undone.
					</p>
					<p class="text-muted-foreground mt-2 text-sm">
						This deletes your profile, library, crates, sets, Discogs
						credentials and uploaded cover images. You will be signed out when
						it finishes.
					</p>
				</div>

				<div class="space-y-2">
					<Label for="account-deletion-confirmation">
						Type
						<span class="font-mono font-bold">{{ accountEmail }}</span>
						to confirm
					</Label>
					<Input
						id="account-deletion-confirmation"
						v-model="confirmationInput"
						type="email"
						placeholder="Enter your account email"
						autocomplete="off"
						autocapitalize="none"
						spellcheck="false"
					/>
				</div>
			</div>

			<DialogFooter v-if="requiresRecentAuthentication" class="gap-2">
				<Button
					variant="outline"
					:disabled="isOpeningLogin"
					@click="showDialog = false"
				>
					Cancel
				</Button>
				<ButtonLoading
					:disabled="isOpeningLogin"
					:loading="isOpeningLogin"
					@click="handleSignInAgain"
				>
					Sign in again
				</ButtonLoading>
			</DialogFooter>

			<DialogFooter v-else class="gap-2">
				<Button
					variant="outline"
					:disabled="isDeleting"
					@click="showDialog = false"
				>
					Cancel
				</Button>
				<ButtonLoading
					variant="destructive"
					:disabled="!isConfirmed || isDeleting"
					:loading="isDeleting"
					@click="handleDelete"
				>
					Delete Account
				</ButtonLoading>
			</DialogFooter>
		</DialogContent>
	</Dialog>
</template>
