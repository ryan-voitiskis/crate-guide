<template>
	<div
		class="p-4 border border-warning/30 rounded-md bg-warning/10 text-warning-foreground"
	>
		<header>
			<h2 class="font-semibold mb-1">
				<slot name="title" />
			</h2>
		</header>
		<p>
			<slot />
		</p>
	</div>
</template>
