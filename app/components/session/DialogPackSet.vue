<script setup lang="ts">
import {
	PACK_SET_CRATE_NAME_MAX,
	defaultPackSetCrateName
} from '~/utils/packSet'

const open = defineModel<boolean>('open', { required: true })

const { isPacking, canPack, setRecords, activeSetName, crates, pack } =
	usePackSet()

type PackMode = 'new' | 'existing'

const mode = ref<PackMode>('new')
const crateName = ref('')
const selectedCrateId = ref<string | undefined>(undefined)

const recordCount = computed(() => setRecords.value.recordIds.length)
const missingTracks = computed(() => setRecords.value.missingTracks)
const hasCrates = computed(() => crates.value.length > 0)

watch(
	open,
	(isOpen) => {
		if (!isOpen) return
		mode.value = 'new'
		crateName.value = defaultPackSetCrateName(activeSetName.value, new Date())
		selectedCrateId.value = undefined
	},
	{ immediate: true }
)

const canSubmit = computed(() => {
	if (!canPack.value || isPacking.value) return false
	if (recordCount.value === 0) return false
	return mode.value === 'new'
		? crateName.value.trim().length > 0
		: !!selectedCrateId.value
})

function handleModeChange(value: unknown) {
	if (value === 'new' || value === 'existing') mode.value = value
}

/** The dialog cannot be dismissed while a pack is running. */
function handleOpenChange(value: boolean) {
	if (!value && isPacking.value) return
	open.value = value
}

async function submit() {
	if (!canSubmit.value) return
	const result = await pack(
		mode.value === 'new'
			? { kind: 'new', name: crateName.value }
			: { kind: 'existing', crateId: selectedCrateId.value! }
	)
	if (result) open.value = false
}
</script>

<template>
	<Dialog :open="open" @update:open="handleOpenChange">
		<DialogTrigger as-child>
			<slot />
		</DialogTrigger>
		<DialogContent class="sm:max-w-md">
			<DialogHeader>
				<DialogTitle>Pack this set</DialogTitle>
				<DialogDescription>
					Put the {{ recordCount }}
					{{ recordCount === 1 ? 'record' : 'records' }} from this set in a
					crate. Records already in the crate stay; nothing is removed.
				</DialogDescription>
			</DialogHeader>

			<p
				v-if="missingTracks > 0"
				class="text-muted-foreground text-xs"
				data-testid="pack-set-missing"
			>
				{{ missingTracks }}
				{{ missingTracks === 1 ? 'track is' : 'tracks are' }} no longer in your
				library and will be skipped.
			</p>

			<form class="space-y-4" @submit.prevent="submit">
				<RadioGroup
					:model-value="mode"
					class="grid gap-2"
					aria-label="Crate"
					@update:model-value="handleModeChange"
				>
					<Label
						class="border-border has-data-[state=checked]:border-primary flex cursor-pointer items-center gap-2 rounded-sm border p-2 text-sm"
					>
						<RadioGroupItem value="new" />
						New crate
					</Label>
					<Label
						class="border-border has-data-[state=checked]:border-primary flex items-center gap-2 rounded-sm border p-2 text-sm"
						:class="hasCrates ? 'cursor-pointer' : 'opacity-60'"
					>
						<RadioGroupItem value="existing" :disabled="!hasCrates" />
						Add to an existing crate
					</Label>
				</RadioGroup>

				<div v-if="mode === 'new'" class="space-y-2">
					<Label for="pack-set-crate-name">Crate name</Label>
					<Input
						id="pack-set-crate-name"
						v-model="crateName"
						:maxlength="PACK_SET_CRATE_NAME_MAX"
						autocomplete="off"
					/>
				</div>

				<div v-else class="space-y-2">
					<Label for="pack-set-crate">Crate</Label>
					<Select v-model="selectedCrateId">
						<SelectTrigger id="pack-set-crate" class="w-full">
							<SelectValue placeholder="Choose a crate" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem
								v-for="crate in crates"
								:key="crate.id"
								:value="crate.id"
							>
								{{ crate.name }} ({{ crate.records.length }})
							</SelectItem>
						</SelectContent>
					</Select>
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						:disabled="isPacking"
						@click="handleOpenChange(false)"
					>
						Cancel
					</Button>
					<ButtonLoading
						type="submit"
						:loading="isPacking"
						:disabled="!canSubmit"
					>
						{{ mode === 'new' ? 'Create crate' : 'Add to crate' }}
					</ButtonLoading>
				</DialogFooter>
			</form>
		</DialogContent>
	</Dialog>
</template>
