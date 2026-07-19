<script setup lang="ts">
import { AlertTriangle } from 'lucide-vue-next'

const records = useRecordsStore()
const tracks = useTracksStore()
const { deleteAllUserData } = useLibraryMutations()

const showDialog = ref(false)
const confirmationInput = ref('')
const isDeleting = ref(false)

const confirmationTarget = computed(() => records.recordsCount.toString())
const isConfirmed = computed(
	() => confirmationInput.value === confirmationTarget.value
)

function openDialog() {
	confirmationInput.value = ''
	showDialog.value = true
}

async function handleDelete() {
	if (!isConfirmed.value) return

	isDeleting.value = true
	const success = await deleteAllUserData()
	isDeleting.value = false

	if (success) {
		showDialog.value = false
	}
}
</script>

<template>
	<Button variant="destructive" @click="openDialog">Clear All Data</Button>

	<Dialog v-model:open="showDialog">
		<DialogContent class="sm:max-w-106.25">
			<DialogHeader>
				<DialogTitle class="flex items-center gap-2">
					<AlertTriangle class="text-destructive size-5" />
					Clear All Data
				</DialogTitle>
				<DialogDescription class="sr-only">
					Permanently delete all records and tracks from your account.
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
						This will permanently delete:
					</p>
					<ul class="text-muted-foreground mt-2 list-inside list-disc text-sm">
						<li>
							<span class="text-foreground font-medium">
								{{ records.recordsCount }}
							</span>
							{{ records.recordsCount === 1 ? 'record' : 'records' }}
						</li>
						<li>
							<span class="text-foreground font-medium">
								{{ tracks.tracksCount }}
							</span>
							{{ tracks.tracksCount === 1 ? 'track' : 'tracks' }}
						</li>
					</ul>
					<p class="text-muted-foreground mt-2 text-sm">
						Your crates and sets will be preserved but emptied.
					</p>
				</div>

				<div class="space-y-2">
					<Label for="confirmation">
						Type
						<span class="font-mono font-bold">{{ confirmationTarget }}</span>
						to confirm
					</Label>
					<Input
						id="confirmation"
						v-model="confirmationInput"
						placeholder="Enter the number of records"
						autocomplete="off"
					/>
				</div>
			</div>

			<DialogFooter class="gap-2">
				<Button variant="outline" @click="showDialog = false">Cancel</Button>
				<ButtonLoading
					variant="destructive"
					:disabled="!isConfirmed || isDeleting"
					:loading="isDeleting"
					@click="handleDelete"
				>
					Delete All Data
				</ButtonLoading>
			</DialogFooter>
		</DialogContent>
	</Dialog>
</template>
