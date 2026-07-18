<script setup lang="ts">
interface Props {
	chip?: string
	title: string
	subtitle?: string
	logoTo?: string
	catalog?: string
	contextTitle?: string
	contextDescription?: string
}

const props = withDefaults(defineProps<Props>(), {
	logoTo: '/demo',
	contextTitle: 'Private library access',
	contextDescription:
		'Create, enrich and prepare your collection in the same focused workbench used by the demo.'
})

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
	<div class="bg-background flex min-h-full flex-col">
		<HeaderPublic section="Account access" />

		<main
			class="relative flex min-h-0 flex-1 items-center justify-center overflow-x-clip py-0 sm:px-4 sm:py-8"
		>
			<div
				aria-hidden="true"
				class="pointer-events-none absolute inset-0 [background:radial-gradient(110%_80%_at_50%_-10%,color-mix(in_oklch,var(--primary)_10%,transparent),transparent_58%)]"
			/>

			<div
				class="relative z-10 grid w-full max-w-4xl items-stretch lg:grid-cols-[17.5rem_minmax(0,30rem)] lg:justify-center"
			>
				<aside
					class="bg-workbench-inset hidden flex-col border border-r-0 p-6 lg:flex"
				>
					<NuxtLink
						:to="logoTo"
						class="focus-visible:ring-ring block aspect-square w-full rounded-full focus-visible:ring-2 focus-visible:outline-none"
						aria-label="Crate Guide demo"
					>
						<LogoCrateGuide />
					</NuxtLink>

					<div class="mt-8">
						<p
							class="text-muted-foreground font-mono text-[9px] tracking-[0.16em] uppercase"
						>
							Access console / 01
						</p>
						<h2 class="mt-2 text-lg font-semibold tracking-tight">
							{{ contextTitle }}
						</h2>
						<p class="text-muted-foreground mt-2 text-xs leading-relaxed">
							{{ contextDescription }}
						</p>
					</div>

					<Button variant="outline" size="sm" class="mt-auto" as-child>
						<NuxtLink to="/demo">Open read-only demo</NuxtLink>
					</Button>
				</aside>

				<section
					class="bg-card relative min-w-0 border-y p-0 shadow-xl sm:rounded-sm sm:border lg:rounded-l-none"
				>
					<span
						aria-hidden="true"
						class="border-foreground/15 absolute -top-px -right-px size-3 border-t border-r"
					/>
					<span
						aria-hidden="true"
						class="border-foreground/15 absolute -right-px -bottom-px size-3 border-r border-b"
					/>

					<header class="border-b px-5 py-5 sm:px-7 sm:py-6">
						<div
							v-if="chip"
							class="text-foreground/45 flex items-center gap-2 font-mono text-[0.65rem] tracking-[0.18em] uppercase"
						>
							<span aria-hidden="true" class="bg-signal h-px w-6" />
							<span>{{ chip }}</span>
						</div>
						<h1
							class="text-foreground mt-3 font-mono text-2xl leading-[1.1] font-normal tracking-tight whitespace-pre sm:text-[1.75rem]"
						>
							<span class="sr-only">{{ title }}</span>
							<!-- prettier-ignore -->
							<span
								v-for="(item, i) in titleChars"
								:key="i"
								aria-hidden="true"
								class="kick-title-char"
								:style="{
									'--kick-peak': `${item.peak}%`,
									'--kick-delay': `${item.delay}ms`
								}"
							>{{ item.char }}</span>
						</h1>
						<p v-if="subtitle" class="text-muted-foreground mt-2 text-sm">
							{{ subtitle }}
						</p>
						<slot name="header-extras" />
					</header>

					<div class="px-5 py-5 sm:px-7 sm:py-6">
						<slot />
					</div>

					<div
						v-if="catalog"
						aria-hidden="true"
						class="text-foreground/40 flex items-center justify-between border-t px-5 py-2.5 font-mono text-[0.6rem] tracking-[0.16em] uppercase sm:px-7"
					>
						<span>Crate Guide access console</span>
						<span>{{ catalog }}</span>
					</div>
				</section>
			</div>
		</main>

		<StatusPublic />
	</div>
</template>
