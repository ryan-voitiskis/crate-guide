<script setup lang="ts">
const user = useSupabaseUser()
</script>

<template>
	<div class="bg-background">
		<header class="flex h-14 w-full justify-between border-b bg-muted">
			<div
				class="mx-auto flex w-full max-w-[1600px] flex-row items-center justify-between p-4"
			>
				<nav class="flex flex-wrap gap-4">
					<Button as-child>
						<NuxtLink to="/">session</NuxtLink>
					</Button>
					<Button as-child>
						<NuxtLink to="/collection">collection</NuxtLink>
					</Button>
				</nav>
				<AvatarGreeting v-if="user" />
				<div v-else class="flex gap-4">
					<Button as-child variant="ghost">
						<NuxtLink to="/signup">Sign up</NuxtLink>
					</Button>
					<Button as-child variant="ghost">
						<NuxtLink to="/login">Log in</NuxtLink>
					</Button>
				</div>
			</div>
		</header>

		<div class="min-h-[calc(100vh_-_56px)]">
			<!-- root node of slot should be <main> for semantic purpose -->
			<slot />
		</div>
	</div>
</template>
