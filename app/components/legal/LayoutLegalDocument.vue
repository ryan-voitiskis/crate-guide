<script setup lang="ts">
import { ArrowLeft } from 'lucide-vue-next'

interface Props {
	title: string
	summary: string
	effectiveDate: string
}

defineProps<Props>()
</script>

<template>
	<div class="bg-background min-h-full px-4 py-8 sm:px-6 sm:py-12">
		<main class="mx-auto w-full max-w-3xl">
			<header class="border-border mb-8 border-b pb-6">
				<NuxtLink
					to="/"
					aria-label="Back to Crate Guide"
					class="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-2.5 transition-colors"
				>
					<span class="size-10"><LogoCrateGuide /></span>
					<ArrowLeft class="size-3.5" aria-hidden="true" />
					<span class="font-mono text-xs tracking-[0.16em] uppercase">
						Back to Crate Guide
					</span>
				</NuxtLink>

				<h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">
					{{ title }}
				</h1>
				<p class="text-muted-foreground mt-3 max-w-2xl leading-relaxed">
					{{ summary }}
				</p>
				<p
					class="text-muted-foreground mt-4 font-mono text-[11px] tracking-wide uppercase"
				>
					Effective {{ effectiveDate }}
				</p>
			</header>

			<article
				class="text-foreground/90 [&_a]:text-primary space-y-8 text-sm leading-7 [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_li]:pl-1 [&_p+p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5"
			>
				<slot />
			</article>

			<footer
				class="border-border text-muted-foreground mt-10 space-y-4 border-t pt-6 text-xs leading-relaxed"
			>
				<LinksLegal />
				<p>
					This application uses Discogs’ API but is not affiliated with,
					sponsored or endorsed by Discogs. “Discogs” is a trademark of Zink
					Media, LLC.
				</p>
			</footer>
		</main>
	</div>
</template>
