<script setup lang="ts">
import { AlertTriangle, FolderOpen, RefreshCw } from 'lucide-vue-next'

const discogs = useDiscogsStore()
</script>

<template>
	<Dialog v-model:open="discogs.showGetFoldersDialog">
		<DialogContent class="gap-4 rounded-sm sm:max-w-lg">
			<div
				class="text-muted-foreground font-mono text-[9px] tracking-[0.18em] uppercase"
			>
				Discogs / Collection source
			</div>
			<DialogHeader>
				<DialogTitle class="text-base tracking-tight">
					Choose a collection folder
				</DialogTitle>
				<DialogDescription class="text-muted-foreground text-sm">
					Pick a Discogs folder, then review every release before import.
				</DialogDescription>
			</DialogHeader>

			<div
				class="border-border bg-workbench-inset overflow-hidden rounded-sm border"
			>
				<div
					class="border-border flex items-center justify-between border-b px-3 py-2"
				>
					<span
						class="text-muted-foreground font-mono text-[9px] tracking-[0.14em] uppercase"
					>
						Available folders
					</span>
					<Button
						variant="ghost"
						size="sm"
						class="h-7 gap-1.5 px-2 text-xs"
						:disabled="discogs.isLoadingFolders"
						@click="discogs.getFolders()"
					>
						<RefreshCw
							class="size-3.5"
							:class="{ 'animate-spin': discogs.isLoadingFolders }"
						/>
						Refresh
					</Button>
				</div>

				<div
					v-if="discogs.isLoadingFolders"
					class="flex min-h-32 items-center justify-center"
				>
					<SpinnerLoading class="text-primary/40 size-10" />
				</div>
				<div
					v-else-if="discogs.folderError"
					role="alert"
					class="flex min-h-40 flex-col items-center justify-center gap-3 px-5 py-6 text-center"
				>
					<div
						class="bg-destructive/10 text-destructive flex size-9 items-center justify-center rounded-sm"
					>
						<AlertTriangle class="size-4.5" />
					</div>
					<div class="space-y-1">
						<p class="text-sm font-semibold">Could not load folders</p>
						<p class="text-muted-foreground max-w-sm text-xs">
							{{ discogs.folderError.message }}
						</p>
						<p
							v-if="discogs.folderError.requestId"
							class="text-muted-foreground font-mono text-[9px] tracking-wide"
						>
							Request {{ discogs.folderError.requestId }}
						</p>
					</div>
					<Button
						variant="outline"
						size="sm"
						class="h-8 gap-1.5 text-xs"
						@click="discogs.getFolders()"
					>
						<RefreshCw class="size-3.5" />
						Try again
					</Button>
				</div>
				<div
					v-else-if="discogs.folders.length === 0"
					class="text-muted-foreground flex min-h-32 flex-col items-center justify-center gap-2 text-sm"
				>
					<FolderOpen class="size-5" />
					No folders found
				</div>
				<RadioGroup
					v-else
					v-model="discogs.selectedFolder"
					class="divide-border divide-y"
				>
					<Label
						v-for="folder in discogs.folders"
						:key="folder.id"
						class="hover:bg-muted/40 has-[[data-state=checked]]:bg-primary/5 flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors"
					>
						<RadioGroupItem :value="folder.name" />
						<FolderOpen class="text-muted-foreground size-4" />
						<span class="min-w-0 flex-1 truncate text-sm font-medium">
							{{ folder.name }}
						</span>
						<span
							class="text-muted-foreground font-mono text-[10px] tabular-nums"
						>
							{{ folder.count }} releases
						</span>
					</Label>
				</RadioGroup>
			</div>
			<DialogFooter>
				<ButtonLoading
					:disabled="!discogs.selectedFolder || Boolean(discogs.folderError)"
					:loading="discogs.isLoadingSelectedFolder"
					@click="discogs.fetchFolderReleases()"
				>
					Review folder
				</ButtonLoading>
			</DialogFooter>
		</DialogContent>
	</Dialog>
</template>
