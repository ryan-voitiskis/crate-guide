<script setup lang="ts">
import {
	Disc3,
	FolderOpen,
	Grid2X2,
	List,
	MoreHorizontal,
	Music2,
	Pencil,
	Plus,
	Search,
	Trash2
} from 'lucide-vue-next'

const crates = useCratesStore()
const records = useRecordsStore()
const tracks = useTracksStore()

const isActive = usePageActive()

const showCreateDialog = ref(false)
const showDetailDialog = ref(false)
const showAddRecordsDialog = ref(false)
const selectedCrateId = ref<string | null>(null)
const crateQuery = ref('')
const recordQuery = ref('')
const viewMode = ref<'list' | 'covers'>('list')

const selectedCrate = computed(() =>
	selectedCrateId.value
		? (crates.getCrateById(selectedCrateId.value) ?? null)
		: null
)

const filteredCrates = computed(() => {
	const query = crateQuery.value.trim().toLowerCase()
	if (!query) return crates.crates
	return crates.crates.filter(
		(crate) =>
			crate.name.toLowerCase().includes(query) ||
			crate.description?.toLowerCase().includes(query)
	)
})

const selectedRecords = computed(() => {
	if (!selectedCrate.value) return []
	const crateRecords = records.getRecordsByIds(selectedCrate.value.records)
	const query = recordQuery.value.trim().toLowerCase()
	if (!query) return crateRecords
	return crateRecords.filter(
		(record) =>
			record.title.toLowerCase().includes(query) ||
			record.artists.some((artist) =>
				artist.name.toLowerCase().includes(query)
			) ||
			record.labels.some(
				(label) =>
					label.name.toLowerCase().includes(query) ||
					label.catno?.toLowerCase().includes(query)
			)
	)
})

const selectedTrackCount = computed(() =>
	selectedRecords.value.reduce(
		(total, record) => total + tracks.getTracksByRecordId(record.id).length,
		0
	)
)

watch(
	() => crates.crates.map((crate) => crate.id),
	(crateIds) => {
		if (!crateIds.length) {
			selectedCrateId.value = null
			return
		}
		if (!selectedCrateId.value || !crateIds.includes(selectedCrateId.value)) {
			selectedCrateId.value = crateIds[0] ?? null
		}
	},
	{ immediate: true }
)

watch(selectedCrateId, () => {
	recordQuery.value = ''
})

function openCreateDialog() {
	showCreateDialog.value = true
}

function handleCreated(crate: Crate) {
	selectedCrateId.value = crate.id
}

function selectCrate(crate: Crate) {
	selectedCrateId.value = crate.id
}

function openDetail() {
	if (selectedCrate.value) showDetailDialog.value = true
}

function handleDelete(crate: Crate) {
	crates.crateToDelete = crate
}

function handleAddRecord() {
	showAddRecordsDialog.value = true
}

watch(
	() => crates.crateToDelete,
	(newVal, oldVal) => {
		if (oldVal && !newVal && !crates.getCrateById(oldVal.id)) {
			showDetailDialog.value = false
		}
	}
)
</script>

<template>
	<div class="flex h-full min-h-0 flex-col">
		<DialogCrateForm v-model:open="showCreateDialog" @saved="handleCreated" />
		<DialogCrateDetails
			v-if="selectedCrate"
			v-model:open="showDetailDialog"
			:crate="selectedCrate"
			@delete="handleDelete"
			@add-record="handleAddRecord"
		/>
		<DialogAddRecords
			v-if="selectedCrate"
			v-model:open="showAddRecordsDialog"
			:crate="selectedCrate"
		/>
		<AlertConfirmDeleteCrate />

		<Teleport to="#header-left" defer>
			<template v-if="isActive && crates.hasCrates">
				<Button size="sm" @click="openCreateDialog">
					<Plus class="mr-2 size-4" />
					New crate
				</Button>
			</template>
		</Teleport>

		<StateLoading
			v-if="crates.isLoadingCrates || records.isLoadingRecords"
			message="Loading crates..."
			class="h-full"
		/>

		<StateEmptyCollection
			v-else-if="!records.hasRecords"
			icon="crates"
			title="Add records before building crates"
			description="Crates help organize records for sets and gigs once your library exists."
		/>

		<div
			v-else-if="crates.hasCrates"
			class="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(120px,35%)_minmax(0,1fr)] overflow-hidden border-t lg:grid-cols-[280px_minmax(0,1fr)] lg:grid-rows-1"
		>
			<aside
				class="bg-muted/15 flex min-h-0 flex-col border-b lg:border-r lg:border-b-0"
			>
				<div class="border-b p-3">
					<div class="flex items-center justify-between gap-2">
						<div>
							<p class="text-xs font-semibold tracking-[0.12em] uppercase">
								Crate library
							</p>
							<p class="text-muted-foreground mt-0.5 text-[11px] tabular-nums">
								{{ crates.cratesCount }} crates ·
								{{ records.records.length }} releases
							</p>
						</div>
						<Button
							variant="ghost"
							size="icon"
							class="size-8"
							title="Create crate"
							aria-label="Create crate"
							@click="openCreateDialog"
						>
							<Plus class="size-4" />
						</Button>
					</div>
					<div class="relative mt-3">
						<Search
							class="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
						/>
						<Input
							v-model="crateQuery"
							placeholder="Filter crates"
							class="h-8 pl-8 text-xs"
						/>
					</div>
				</div>

				<div class="scrollbar-hidden min-h-0 overflow-y-auto">
					<CardCrate
						v-for="crate in filteredCrates"
						:key="crate.id"
						:crate="crate"
						:active="crate.id === selectedCrateId"
						@select="selectCrate"
					/>
					<p
						v-if="!filteredCrates.length"
						class="text-muted-foreground px-4 py-8 text-center text-xs"
					>
						No crates match “{{ crateQuery }}”.
					</p>
				</div>
			</aside>

			<main v-if="selectedCrate" class="flex min-h-0 min-w-0 flex-col">
				<header
					class="bg-background/95 flex flex-col gap-3 border-b p-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between"
				>
					<div class="min-w-0">
						<div class="flex min-w-0 items-center gap-2">
							<span
								class="size-2.5 shrink-0 rounded-full"
								:class="!selectedCrate.color && 'bg-border'"
								:style="
									selectedCrate.color
										? { backgroundColor: selectedCrate.color }
										: undefined
								"
							/>
							<h1 class="truncate text-lg font-semibold">
								{{ selectedCrate.name }}
							</h1>
						</div>
						<p class="text-muted-foreground mt-1 max-w-2xl truncate text-xs">
							{{ selectedCrate.description || 'No crate notes yet.' }}
						</p>
						<div
							class="text-muted-foreground mt-2 flex items-center gap-3 font-mono text-[11px] tabular-nums"
						>
							<span class="inline-flex items-center gap-1">
								<Disc3 class="size-3" />
								{{ selectedCrate.records.length }}
								releases
							</span>
							<span class="inline-flex items-center gap-1">
								<Music2 class="size-3" />
								{{ selectedTrackCount }} tracks
							</span>
						</div>
					</div>

					<div class="flex shrink-0 items-center gap-2">
						<Button variant="outline" size="sm" @click="openDetail">
							<Pencil class="mr-2 size-3.5" />
							Edit
						</Button>
						<Button size="sm" @click="handleAddRecord">
							<Plus class="mr-2 size-3.5" />
							Add records
						</Button>
						<DropdownMenu>
							<DropdownMenuTrigger as-child>
								<Button
									variant="ghost"
									size="icon"
									class="size-8"
									aria-label="More crate actions"
								>
									<MoreHorizontal class="size-4" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem @click="openDetail">
									<Pencil class="mr-2 size-4" />
									Edit details
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									class="text-destructive"
									@click="handleDelete(selectedCrate)"
								>
									<Trash2 class="mr-2 size-4" />
									Delete crate
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</header>

				<div class="flex items-center gap-2 border-b p-2.5">
					<div class="relative min-w-0 flex-1 sm:max-w-sm">
						<Search
							class="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
						/>
						<Input
							v-model="recordQuery"
							placeholder="Search this crate"
							class="h-8 pl-8 text-xs"
						/>
					</div>
					<div class="bg-muted flex rounded-md p-0.5">
						<Button
							:variant="viewMode === 'list' ? 'secondary' : 'ghost'"
							size="icon"
							class="size-7"
							title="List view"
							aria-label="List view"
							@click="viewMode = 'list'"
						>
							<List class="size-3.5" />
						</Button>
						<Button
							:variant="viewMode === 'covers' ? 'secondary' : 'ghost'"
							size="icon"
							class="size-7"
							title="Cover view"
							aria-label="Cover view"
							@click="viewMode = 'covers'"
						>
							<Grid2X2 class="size-3.5" />
						</Button>
					</div>
				</div>

				<div class="scrollbar-hidden min-h-0 flex-1 overflow-y-auto">
					<div
						v-if="!selectedRecords.length"
						class="flex min-h-64 flex-col items-center justify-center p-8 text-center"
					>
						<div
							class="bg-muted text-muted-foreground mb-3 flex size-12 items-center justify-center rounded-full"
						>
							<FolderOpen class="size-5" />
						</div>
						<p class="text-sm font-medium">
							{{
								recordQuery
									? 'No matching releases'
									: 'This crate is ready for records'
							}}
						</p>
						<p class="text-muted-foreground mt-1 text-xs">
							{{
								recordQuery
									? 'Try another search term.'
									: 'Add releases from your library to start shaping the set.'
							}}
						</p>
						<Button
							v-if="!recordQuery"
							class="mt-4"
							size="sm"
							@click="handleAddRecord"
						>
							<Plus class="mr-2 size-4" />
							Add records
						</Button>
					</div>

					<div v-else-if="viewMode === 'list'" class="min-w-[680px]">
						<div
							class="bg-muted/50 text-muted-foreground grid grid-cols-[44px_minmax(220px,1.5fr)_minmax(160px,1fr)_100px_70px_70px] items-center gap-3 border-b px-3 py-1.5 text-[10px] font-semibold tracking-[0.08em] uppercase"
						>
							<span>Art</span>
							<span>Release</span>
							<span>Label</span>
							<span>Catalog</span>
							<span>Year</span>
							<span>Tracks</span>
						</div>
						<div
							v-for="record in selectedRecords"
							:key="record.id"
							class="hover:bg-muted/40 grid grid-cols-[44px_minmax(220px,1.5fr)_minmax(160px,1fr)_100px_70px_70px] items-center gap-3 border-b px-3 py-2 text-xs transition-colors last:border-b-0"
						>
							<div class="bg-muted size-9 overflow-hidden rounded-sm border">
								<img
									v-if="record.cover"
									:src="record.cover"
									:alt="`${record.title} cover`"
									class="size-full object-cover"
								/>
							</div>
							<div class="min-w-0">
								<p class="truncate font-medium">{{ record.title }}</p>
								<p class="text-muted-foreground truncate text-[11px]">
									{{ record.artists.map((artist) => artist.name).join(', ') }}
								</p>
							</div>
							<span class="truncate">{{ record.labels[0]?.name || '—' }}</span>
							<span class="font-mono text-[11px] tabular-nums">
								{{ record.labels[0]?.catno || '—' }}
							</span>
							<span class="font-mono tabular-nums">
								{{ record.year || '—' }}
							</span>
							<span class="font-mono tabular-nums">
								{{ tracks.getTracksByRecordId(record.id).length }}
							</span>
						</div>
					</div>

					<div
						v-else
						class="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6"
					>
						<div
							v-for="record in selectedRecords"
							:key="record.id"
							class="min-w-0"
						>
							<div
								class="bg-muted aspect-square overflow-hidden rounded-sm border shadow-sm"
							>
								<img
									v-if="record.cover"
									:src="record.cover"
									:alt="`${record.title} cover`"
									class="size-full object-cover transition-transform duration-300 hover:scale-[1.02]"
								/>
							</div>
							<p class="mt-2 truncate text-xs font-medium">
								{{ record.title }}
							</p>
							<p class="text-muted-foreground truncate text-[11px]">
								{{ record.labels[0]?.catno || record.artists[0]?.name }}
							</p>
						</div>
					</div>
				</div>
			</main>
		</div>

		<div
			v-else
			class="flex min-h-0 flex-1 flex-col items-center justify-center p-8 text-center"
		>
			<div
				class="bg-muted text-muted-foreground mb-4 flex size-16 items-center justify-center rounded-full"
			>
				<FolderOpen class="size-7" />
			</div>
			<h2 class="text-lg font-semibold">Build your first crate</h2>
			<p class="text-muted-foreground mt-1 max-w-sm text-sm">
				Group records by room, energy, set time, or whatever helps you find the
				right track quickly.
			</p>
			<Button class="mt-5" @click="openCreateDialog">
				<Plus class="mr-2 size-4" />
				Create crate
			</Button>
		</div>
	</div>
</template>
