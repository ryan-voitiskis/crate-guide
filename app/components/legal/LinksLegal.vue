<template>
	<nav
		class="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
		aria-label="Project links"
	>
		<NuxtLink class="hover:text-foreground transition-colors" to="/privacy">
			Privacy
		</NuxtLink>
		<NuxtLink class="hover:text-foreground transition-colors" to="/terms">
			Terms
		</NuxtLink>
		<a
			class="hover:text-foreground transition-colors"
			href="https://github.com/ryan-voitiskis/crate-guide"
			target="_blank"
			rel="noopener noreferrer"
		>
			Source
		</a>
	</nav>
</template>
