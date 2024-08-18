<script setup lang="ts">
const user = useUserStore()
</script>

<template>
	<div class="bg-background">
		<header class="flex h-14 w-full justify-between">
			<div
				class="mx-auto flex w-full max-w-[1600px] flex-row items-center justify-between p-4"
			>
				<nav class="flex flex-wrap bg-muted rounded-lg p-1">
					<Button
						variant="blank"
						class="text-muted-foreground w-32"
						active-class="bg-background shadow-sm !text-foreground"
						as-child
					>
						<NuxtLink to="/">Session</NuxtLink>
					</Button>
					<Button
						variant="blank"
						class="text-muted-foreground w-32"
						active-class="bg-background shadow-sm !text-foreground"
						as-child
					>
						<NuxtLink to="/collection">Collection</NuxtLink>
					</Button>
				</nav>

				<AvatarGreeting v-if="user.supaUser" />
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
