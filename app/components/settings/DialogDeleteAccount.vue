<script setup lang="ts">
import { AlertTriangle } from 'lucide-vue-next'

const user = useUserStore()

const showDialog = ref(false)
const confirmationInput = ref('')
const isDeleting = ref(false)

const accountEmail = computed(() => user.supaUser?.email ?? '')
const isConfirmed = computed(
	() =>
		Boolean(accountEmail.value) &&
		confirmationInput.value.trim().toLocaleLowerCase('en-US') ===
			accountEmail.value.trim().toLocaleLowerCase('en-US')
)

function openDialog() {
	confirmationInput.value = ''
	showDialog.value = true
}

async function handleDelete() {
	if (!isConfirmed.value || isDeleting.value) return

	isDeleting.value = true
	const success = await user.deleteAccount(confirmationInput.value)
	isDeleting.value = false

	if (success) showDialog.value = false
}
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

			<div class="space-y-4">
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

			<DialogFooter class="gap-2">
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
