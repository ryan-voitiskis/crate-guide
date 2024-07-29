<template>
	<div class="bg-background">
		<header class="flex h-14 w-full justify-between border-b bg-muted">
			<div
				class="mx-auto flex w-full max-w-[1120px] flex-row items-center justify-between p-4"
			>
				<nav id="main_nav" class="-ml-4 flex flex-wrap gap-y-4">
					<Button as-child class="-my-4">
						<NuxtLink to="/">session</NuxtLink>
					</Button>
					<Button as-child class="-my-4">
						<NuxtLink to="/collection">collection</NuxtLink>
					</Button>
				</nav>
				<!-- <ThemeToggle class="-my-2" /> -->
			</div>
		</header>

		<div class="min-h-[calc(100vh_-_56px)]">
			<!-- root node of slot should be <main> for semantic purpose -->
			<slot />
		</div>
	</div>
</template>
