<script setup lang="ts">
import { ImageOff } from 'lucide-vue-next'

const props = withDefaults(
	defineProps<{
		record: Pick<DatabaseRecord, 'cover' | 'cover_storage_path' | 'title'>
		alt?: string
		showLabel?: boolean
		objectPosition?: string
	}>(),
	{
		alt: '',
		showLabel: false,
		objectPosition: '50% 50%'
	}
)

const { getCoverUrl } = useRecordCover()
const coverUrl = ref<string | null>(null)
const loaded = ref(false)
const failed = ref(false)
let coverRequest = 0

watch(
	() => [props.record.cover_storage_path, props.record.cover] as const,
	async () => {
		const request = ++coverRequest
		loaded.value = false
		failed.value = false
		const nextUrl = await getCoverUrl(props.record)
		if (request === coverRequest) coverUrl.value = nextUrl
	},
	{ immediate: true }
)
</script>

<template>
	<div
		class="bg-muted relative flex items-center justify-center overflow-hidden"
	>
		<div
			v-if="coverUrl && !loaded && !failed"
			class="bg-muted absolute inset-0 animate-pulse"
		/>
		<img
			v-if="coverUrl && !failed"
			:src="coverUrl"
			:alt="alt || `${record.title} cover`"
			class="size-full object-cover transition-opacity duration-150"
			:class="loaded ? 'opacity-100' : 'opacity-0'"
			:style="{ objectPosition }"
			@load="loaded = true"
			@error="failed = true"
		/>

		<slot v-else-if="failed" name="error">
			<div
				class="text-muted-foreground flex flex-col items-center justify-center gap-2 text-center"
				role="img"
				aria-label="Cover image unavailable"
			>
				<ImageOff class="size-6 stroke-[1.5]" />
				<span v-if="showLabel" class="text-xs">Cover unavailable</span>
			</div>
		</slot>

		<slot v-else name="missing">
			<div
				class="text-muted-foreground flex flex-col items-center justify-center gap-2 text-center"
				role="img"
				aria-label="No cover artwork"
			>
				<ImageOff class="size-6 stroke-[1.5]" />
				<span v-if="showLabel" class="text-xs">No cover artwork</span>
			</div>
		</slot>
	</div>
</template>
