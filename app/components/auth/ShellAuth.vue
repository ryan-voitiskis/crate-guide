<script setup lang="ts">
interface Props {
	/** Small catalog chip shown above the title, e.g. "Side A · Sign in" */
	chip?: string
	/** Main display title */
	title: string
	/** Optional subtitle / description */
	subtitle?: string
	/** Where the logo links to (defaults to /demo) */
	logoTo?: string
	/** Catalog / issue number shown bottom-right inside the frame */
	catalog?: string
}

const props = withDefaults(defineProps<Props>(), {
	logoTo: '/demo'
})

const grooveRadii = [96, 86, 76, 66]

// Map each title character to a peak amplitude (% mix into primary) shaped
// like a kick drum's frequency spectrum: strong low-end, fast decay into the
// mids, with a small transient "click" resurgence near the tail.
const titleChars = computed(() => {
	const letters = [...props.title]
	const last = Math.max(letters.length - 1, 1)
	return letters.map((char, i) => {
		const t = i / last
		const lowEnd = 70 * Math.pow(1 - t, 1.8)
		const click = t > 0.6 ? 22 * Math.max(0, 1 - Math.abs(t - 0.85) * 4) : 0
		return {
			char,
			peak: Math.max(lowEnd, click, 6).toFixed(1),
			delay: (i * 45).toString()
		}
	})
})
</script>

<template>
	<div
		class="bg-background relative flex min-h-svh items-center justify-center overflow-hidden px-4 py-10"
	>
		<!-- Ambient backdrop: faint radial wash that adapts to theme via tokens -->
		<div
			aria-hidden="true"
			class="pointer-events-none absolute inset-0 [background:radial-gradient(120%_80%_at_50%_-10%,color-mix(in_oklch,var(--primary)_12%,transparent),transparent_60%)]"
		/>

		<!-- Floating theme toggle -->
		<div class="absolute top-4 right-4 z-20 sm:top-6 sm:right-6">
			<ToggleTheme />
		</div>

		<!-- Card frame -->
		<div class="relative z-10 w-full max-w-md">
			<!-- Corner tick marks (decorative) -->
			<span
				aria-hidden="true"
				class="border-foreground/15 absolute -top-px -left-px size-3 border-t border-l"
			/>
			<span
				aria-hidden="true"
				class="border-foreground/15 absolute -top-px -right-px size-3 border-t border-r"
			/>
			<span
				aria-hidden="true"
				class="border-foreground/15 absolute -bottom-px -left-px size-3 border-b border-l"
			/>
			<span
				aria-hidden="true"
				class="border-foreground/15 absolute -right-px -bottom-px size-3 border-r border-b"
			/>

			<Card
				class="border-border/70 bg-card/95 relative rounded-lg p-0 shadow-xl backdrop-blur-sm"
			>
				<!-- Logo + groove halo -->
				<div class="relative px-6 pt-8 pb-2 sm:px-8">
					<div class="relative mx-auto size-28">
						<!-- Concentric groove rings -->
						<svg
							aria-hidden="true"
							viewBox="0 0 200 200"
							class="text-foreground/15 absolute inset-0 -m-6 size-[calc(100%+3rem)]"
							fill="none"
						>
							<g stroke="currentColor" stroke-width="0.5">
								<circle
									v-for="r in grooveRadii"
									:key="r"
									cx="100"
									cy="100"
									:r="r"
								/>
							</g>
						</svg>
						<NuxtLink
							:to="logoTo"
							class="focus-visible:ring-ring relative block size-full rounded-full focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
							aria-label="Crate Guide home"
						>
							<LogoCrateGuide />
						</NuxtLink>
					</div>
				</div>

				<!-- Header: chip + title + subtitle -->
				<header class="space-y-3 px-6 pt-4 pb-2 sm:px-8">
					<div
						v-if="chip"
						class="text-foreground/35 flex items-center gap-2 font-mono text-[0.7rem] tracking-[0.2em] uppercase"
					>
						<span aria-hidden="true" class="bg-foreground/20 h-px w-6" />
						<span>{{ chip }}</span>
					</div>
					<h1
						class="text-foreground font-mono text-2xl leading-[1.1] font-normal tracking-tight whitespace-pre sm:text-[1.75rem]"
					>
						<!-- prettier-ignore -->
						<span
							v-for="(item, i) in titleChars"
							:key="i"
							class="kick-title-char"
							:style="{
								'--kick-peak': `${item.peak}%`,
								'--kick-delay': `${item.delay}ms`
							}"
						>{{ item.char }}</span>
					</h1>
					<p v-if="subtitle" class="text-muted-foreground text-sm">
						{{ subtitle }}
					</p>
					<slot name="header-extras" />
				</header>

				<!-- Body slot -->
				<div class="px-6 pt-4 pb-6 sm:px-8 sm:pb-8">
					<slot />
				</div>

				<!-- Footer catalog strip (decorative) -->
				<div
					v-if="catalog"
					aria-hidden="true"
					class="border-border/50 text-foreground/35 flex items-center justify-between border-t px-6 py-3 font-mono text-[0.65rem] tracking-[0.18em] uppercase sm:px-8"
				>
					<span>Crate Guide</span>
					<span>{{ catalog }}</span>
				</div>
			</Card>
		</div>
	</div>
</template>
