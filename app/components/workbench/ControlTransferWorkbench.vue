<script setup lang="ts">
import { CheckCircle2, LoaderCircle, TriangleAlert, X } from 'lucide-vue-next'

interface Props {
	variant?: 'status' | 'mobile'
}

withDefaults(defineProps<Props>(), {
	variant: 'status'
})

const user = useSupabaseUser()
const route = useRoute()
const discogs = useDiscogsStore()

const isDemo = computed(() => route.path.startsWith('/demo'))
const isVisible = computed(
	() => Boolean(user.value) && !isDemo.value && discogs.hasTransferActivity
)

const progressLabel = computed(() => {
	if (!discogs.isImporting || discogs.importPhase !== 'fetching') return null
	return `${Math.round(discogs.importProgress)}%`
})

const accessibleLabel = computed(
	() => `Transfers: ${discogs.transferLabel}. Open transfer monitor.`
)

const toneClasses = computed(() => {
	switch (discogs.transferTone) {
		case 'success':
			return 'text-led'
		case 'warning':
			return 'text-amber-300'
		default:
			return 'text-signal'
	}
})
</script>

<template>
	<div
		v-if="isVisible"
		class="shrink-0 items-center"
		:class="variant === 'status' ? 'hidden lg:flex' : 'flex lg:hidden'"
	>
		<button
			type="button"
			:aria-label="accessibleLabel"
			:title="accessibleLabel"
			class="focus-visible:ring-signal group flex items-center rounded-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
			:class="
				variant === 'status'
					? 'h-5 gap-1.5 px-1.5 text-[0.55rem] tracking-[0.1em] text-white/45 uppercase hover:bg-white/8 hover:text-white'
					: 'h-11 min-w-11 justify-center gap-1.5 border border-white/10 px-2 text-white/60 hover:bg-white/10 hover:text-white'
			"
			@click="discogs.openTransferMonitor"
		>
			<LoaderCircle
				v-if="discogs.transferTone === 'active'"
				class="size-3.5 shrink-0 animate-spin"
				:class="toneClasses"
			/>
			<CheckCircle2
				v-else-if="discogs.transferTone === 'success'"
				class="size-3.5 shrink-0"
				:class="toneClasses"
			/>
			<TriangleAlert v-else class="size-3.5 shrink-0" :class="toneClasses" />

			<template v-if="variant === 'status'">
				<span class="text-white/25">Transfers</span>
				<span class="text-white/15">/</span>
				<span class="max-w-44 truncate" :class="toneClasses">
					{{ discogs.transferLabel }}
				</span>
			</template>
			<span
				v-else-if="progressLabel"
				class="font-mono text-[0.6rem] tabular-nums"
				:class="toneClasses"
			>
				{{ progressLabel }}
			</span>
		</button>

		<button
			v-if="variant === 'status' && !discogs.isImporting"
			type="button"
			class="focus-visible:ring-signal flex size-5 items-center justify-center rounded-sm text-white/25 transition-colors hover:bg-white/8 hover:text-white focus-visible:ring-2 focus-visible:outline-none"
			aria-label="Dismiss transfer status"
			title="Dismiss transfer status"
			@click="discogs.dismissTransferMonitor"
		>
			<X class="size-3" />
		</button>
	</div>
</template>
