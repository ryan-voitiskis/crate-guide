<script setup lang="ts">
import { ListX, PackagePlus, X } from '@lucide/vue'
import { toast } from 'vue-sonner'
import type { HistoryMoveSource } from '~/utils/setPlanner'
import type { LibraryPlayedTrackEntry } from '~~/shared/types/library'

const session = useWorkbenchSessionStore()
const tracks = useWorkbenchTracksStore()
const capabilities = useWorkbenchCapabilities()
const runtime = useWorkbenchRuntime()

const panelRef = ref<HTMLElement | null>(null)
const listRef = ref<HTMLOListElement | null>(null)
const announcement = ref('')
const showPackDialog = ref(false)
const dragFromIndex = ref<number | null>(null)
const dropTargetIndex = ref<number | null>(null)

const canPack = computed(
	() => capabilities.canManageCrates && !runtime.descriptor.value.readOnly
)

function entryKey(entry: LibraryPlayedTrackEntry): string {
	return `${entry.track_id}:${entry.time_added}`
}

function entryTitle(entry: LibraryPlayedTrackEntry): string {
	return (
		entry.track_title ?? tracks.getTrackById(entry.track_id)?.title ?? 'Track'
	)
}

function announce(message: string) {
	// Reset first so repeating the same message is announced again.
	announcement.value = ''
	void nextTick(() => {
		announcement.value = message
	})
}

function itemAt(index: number): HTMLElement | null {
	return (
		listRef.value?.querySelector<HTMLElement>(
			`[data-history-index="${index}"]`
		) ?? null
	)
}

/**
 * Moving a keyed node detaches it, which drops focus. Put focus back on the
 * control that was used, or on the entry itself when that control is now
 * disabled (moved to an end of the list).
 */
async function restoreFocus(index: number, source: HistoryMoveSource) {
	await nextTick()
	const item = itemAt(index)
	if (!item) return
	if (source === 'move-up' || source === 'move-down') {
		const button = item.querySelector<HTMLButtonElement>(
			`[data-history-action="${source}"]`
		)
		if (button && !button.disabled) {
			button.focus()
			return
		}
	}
	item.focus()
}

/** The toast's Undo is bound to this edit; a later edit makes it refuse. */
function offerUndo(message: string, editId: number) {
	toast(message, {
		action: {
			label: 'Undo',
			onClick: () => {
				if (session.undoHistoryEdit(editId)) {
					announce('Undone.')
				} else {
					toast.info('The set changed since, so that edit cannot be undone.')
				}
			}
		}
	})
}

function ratingsClearedText(count: number): string {
	return `${count} transition ${count === 1 ? 'rating' : 'ratings'} cleared`
}

function handleMove(
	fromIndex: number,
	toIndex: number,
	source: HistoryMoveSource
) {
	const entry = session.currentSession[fromIndex]
	if (!entry) return
	const result = session.moveHistoryEntry(fromIndex, toIndex)
	if (!result) return

	const total = session.currentSession.length
	let message = `${entryTitle(entry)} moved to position ${toIndex + 1} of ${total}.`
	if (result.clearedRatings > 0) {
		message += ` ${ratingsClearedText(result.clearedRatings)}.`
		offerUndo(
			`Moved. ${ratingsClearedText(result.clearedRatings)}.`,
			result.editId
		)
	}
	announce(message)
	void restoreFocus(toIndex, source)
}

async function handleRemove(index: number) {
	const result = session.removeHistoryEntry(index)
	if (!result?.removedEntry) return

	let message = `${entryTitle(result.removedEntry)} removed from the set.`
	if (result.clearedRatings > 0) {
		message += ` ${ratingsClearedText(result.clearedRatings)}.`
	}
	announce(message)
	offerUndo(message, result.editId)

	await nextTick()
	const nextIndex = Math.min(index, session.currentSession.length - 1)
	if (nextIndex >= 0) itemAt(nextIndex)?.focus()
	else panelRef.value?.focus()
}

function handleDragStart(index: number, event: DragEvent) {
	dragFromIndex.value = index
	if (event.dataTransfer) {
		event.dataTransfer.effectAllowed = 'move'
		event.dataTransfer.setData('text/plain', String(index))
	}
}

function handleDragOver(index: number, event: DragEvent) {
	if (dragFromIndex.value === null) return
	event.preventDefault()
	if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
	dropTargetIndex.value = index
}

function handleDrop(index: number, event: DragEvent) {
	event.preventDefault()
	const from = dragFromIndex.value
	handleDragEnd()
	if (from === null || from === index) return
	handleMove(from, index, 'drag')
}

function handleDragEnd() {
	dragFromIndex.value = null
	dropTargetIndex.value = null
}
</script>

<template>
	<div
		ref="panelRef"
		class="flex h-full flex-col outline-none"
		tabindex="-1"
		aria-label="Session history"
	>
		<div class="flex min-h-11 items-center justify-between px-3 py-2">
			<div>
				<div
					class="text-muted-foreground font-mono text-[9px] tracking-[0.14em] uppercase"
				>
					Live log
				</div>
				<h2 id="session-history-heading" class="text-sm font-semibold">
					Session history
				</h2>
			</div>
			<div class="flex items-center gap-2">
				<span class="text-muted-foreground font-mono text-[10px] tabular-nums">
					{{ session.sessionTrackCount }} tracks
				</span>
				<Button
					v-if="session.currentSession.length > 0"
					variant="ghost"
					size="icon"
					class="h-6 w-6"
					title="Clear session"
					aria-label="Clear session"
					@click="session.clearSession()"
				>
					<ListX class="h-4 w-4" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					class="size-7 xl:hidden"
					aria-label="Close session history"
					@click="session.showHistory = false"
				>
					<X class="size-4" />
				</Button>
			</div>
		</div>

		<div
			v-if="session.currentSession.length > 0"
			class="space-y-2 px-3 pb-2"
			data-testid="session-planner-tools"
		>
			<MetricSessionBpmArc />
			<div class="flex items-center justify-end gap-1.5">
				<ControlsSessionExport />
				<!-- As the dialog's trigger, the button gets focus back on close. -->
				<DialogPackSet v-if="canPack" v-model:open="showPackDialog">
					<Button
						variant="outline"
						size="sm"
						class="h-7 gap-1.5 px-2 text-xs"
						title="Put every record from this set in a crate"
					>
						<PackagePlus class="size-3.5" />
						Pack this set
					</Button>
				</DialogPackSet>
				<Button
					v-else
					variant="outline"
					size="sm"
					class="h-7 gap-1.5 px-2 text-xs"
					disabled
					aria-describedby="pack-set-unavailable"
				>
					<PackagePlus class="size-3.5" />
					Pack this set
				</Button>
			</div>
			<p
				v-if="!canPack"
				id="pack-set-unavailable"
				class="text-muted-foreground text-right text-[11px]"
			>
				Crates can't be changed in this workspace, so packing is off.
			</p>
		</div>

		<Separator />

		<p class="sr-only" aria-live="polite" data-testid="history-announcement">
			{{ announcement }}
		</p>

		<ScrollArea class="flex-1">
			<ol
				v-if="session.currentSession.length > 0"
				ref="listRef"
				class="px-3"
				aria-labelledby="session-history-heading"
			>
				<CardSessionHistoryTrack
					v-for="(entry, index) in session.currentSession"
					:key="entryKey(entry)"
					:entry="entry"
					:index="index"
					:is-first="index === 0"
					:is-last="index === session.currentSession.length - 1"
					draggable="true"
					:class="{
						'opacity-50': dragFromIndex === index,
						'border-t-primary border-t-2':
							dropTargetIndex === index &&
							dragFromIndex !== null &&
							dragFromIndex > index,
						'border-b-primary border-b-2':
							dropTargetIndex === index &&
							dragFromIndex !== null &&
							dragFromIndex < index
					}"
					@move="(toIndex, source) => handleMove(index, toIndex, source)"
					@remove="handleRemove(index)"
					@dragstart="handleDragStart(index, $event)"
					@dragover="handleDragOver(index, $event)"
					@drop="handleDrop(index, $event)"
					@dragend="handleDragEnd"
				/>
			</ol>

			<div
				v-else
				class="text-muted-foreground flex h-32 items-center justify-center text-center text-sm"
			>
				No tracks played yet
			</div>
		</ScrollArea>
	</div>
</template>
