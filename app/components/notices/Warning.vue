<template>
	<div
		class="border-warning/30 bg-warning/10 text-warning-foreground rounded-md border p-4"
	>
		<header>
			<h2 class="mb-1 font-semibold">
				<slot name="title" />
			</h2>
		</header>
		<slot />
	</div>
</template>
