<template>
	<footer
		class="bg-workbench-inset text-foreground border-border flex min-h-7 shrink-0 items-center gap-3 border-t px-2 font-mono text-[9px] tracking-[0.1em] uppercase sm:px-3"
		aria-label="Public session status"
	>
		<div class="flex shrink-0 items-center gap-1.5">
			<span
				class="bg-led h-1.5 w-1.5 rounded-full shadow-[0_0_6px_var(--led)]"
			/>
			<span>Anonymous session</span>
		</div>
		<span class="hidden sm:inline">Read-only preview</span>
		<LinksLegal variant="chrome" class="ml-auto" />
		<span class="border-border hidden border-l pl-3 sm:inline">CG · 33⅓</span>
	</footer>
</template>
