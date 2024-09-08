<template>
	<div
		class="rounded-md border border-warning/30 bg-warning/10 p-4 text-warning-foreground"
	>
		<header>
			<h2 class="mb-1 font-semibold">
				<slot name="title" />
			</h2>
		</header>
		<slot />
	</div>
</template>
