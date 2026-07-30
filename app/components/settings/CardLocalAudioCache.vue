<script setup lang="ts">
import { Database, RefreshCw, Trash2 } from '@lucide/vue'
import {
	type LocalAudioCacheStatus,
	clearLocalAudioAnalysisCache,
	getLocalAudioCacheStatus
} from '~/utils/localAudioCache'

const cacheStatus = ref<LocalAudioCacheStatus | null>(null)
const isLoading = ref(false)
const isClearing = ref(false)
const clearDialogOpen = ref(false)
const errorMessage = ref<string | null>(null)
const successMessage = ref<string | null>(null)

const formattedLastPruned = computed(() => {
	if (!cacheStatus.value?.lastPrunedAt) return 'Not pruned yet'
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short'
	}).format(new Date(cacheStatus.value.lastPrunedAt))
})

async function refreshStatus() {
	isLoading.value = true
	errorMessage.value = null
	try {
		cacheStatus.value = await getLocalAudioCacheStatus()
	} catch (error) {
		cacheStatus.value = null
		errorMessage.value =
			error instanceof Error ? error.message : 'Cache status is unavailable'
	} finally {
		isLoading.value = false
	}
}

async function clearCache() {
	isClearing.value = true
	errorMessage.value = null
	successMessage.value = null
	try {
		await clearLocalAudioAnalysisCache()
		clearDialogOpen.value = false
		successMessage.value = 'Local analysis cache cleared'
		await refreshStatus()
	} catch (error) {
		errorMessage.value =
			error instanceof Error ? error.message : 'Clearing the cache failed'
	} finally {
		isClearing.value = false
	}
}

onMounted(refreshStatus)
onActivated(() => {
	if (cacheStatus.value || errorMessage.value) void refreshStatus()
})
</script>

<template>
	<div
		class="grid gap-4 md:grid-cols-[minmax(0,0.8fr)_minmax(260px,1.2fr)] md:items-start"
	>
		<div>
			<div class="flex items-center gap-2">
				<Database class="text-primary size-4" />
				<h2 class="text-sm font-semibold">Local analysis cache</h2>
			</div>
			<p class="text-muted-foreground mt-1 text-xs leading-relaxed">
				Disposable copies of audio tags and BPM/key analysis make rescans
				faster. This is not your library or a backup. Clearing it does not
				delete saved records, tracks, or your audio files.
			</p>
		</div>

		<div class="border-border bg-muted/25 rounded-sm border p-3">
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div>
					<p class="text-sm font-medium">
						<template v-if="cacheStatus">
							{{ cacheStatus.entryCount.toLocaleString() }} cached results
						</template>
						<template v-else-if="isLoading">Checking local cache…</template>
						<template v-else>Cache status unavailable</template>
					</p>
					<p v-if="cacheStatus" class="text-muted-foreground mt-1 text-xs">
						Last maintenance: {{ formattedLastPruned }}
					</p>
				</div>
				<div class="flex gap-2">
					<Button
						variant="ghost"
						size="sm"
						:disabled="isLoading || isClearing"
						aria-label="Refresh local analysis cache status"
						@click="refreshStatus"
					>
						<RefreshCw
							class="size-3.5"
							:class="isLoading ? 'animate-spin' : ''"
						/>
					</Button>
					<Button
						data-testid="open-clear-audio-cache"
						variant="outline"
						size="sm"
						:disabled="isLoading || isClearing || !cacheStatus?.entryCount"
						@click="clearDialogOpen = true"
					>
						<Trash2 class="mr-1.5 size-3.5" />
						Clear cache
					</Button>
				</div>
			</div>

			<p v-if="cacheStatus" class="text-muted-foreground mt-3 text-xs">
				Entries older than {{ cacheStatus.maxAgeDays }} days are removed first;
				the oldest writes are then removed above
				{{ cacheStatus.maxEntries.toLocaleString() }} results. Cache hits do not
				reset their age.
			</p>
			<p v-if="errorMessage" class="text-destructive mt-3 text-xs" role="alert">
				{{ errorMessage }}
			</p>
			<p
				v-else-if="successMessage"
				class="mt-3 text-xs text-emerald-700 dark:text-emerald-400"
				role="status"
			>
				{{ successMessage }}
			</p>
		</div>

		<AlertDialog v-model:open="clearDialogOpen">
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Clear local analysis cache?</AlertDialogTitle>
					<AlertDialogDescription>
						Cached tags and BPM/key analysis on this device will be removed.
						Your saved library and audio files are not affected, but future
						rescans may take longer.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel :disabled="isClearing">Cancel</AlertDialogCancel>
					<AlertDialogActionLoading
						data-testid="confirm-clear-audio-cache"
						class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						:loading="isClearing"
						@click="clearCache"
					>
						Clear cache
					</AlertDialogActionLoading>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	</div>
</template>
