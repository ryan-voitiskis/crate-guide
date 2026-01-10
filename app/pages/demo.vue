<script setup lang="ts">
const user = useSupabaseUser()
</script>

<template>
	<div class="flex h-screen items-center justify-center">
		<Card class="w-full max-w-md rounded-lg p-6 shadow-md">
			<CardHeader class="space-y-1">
				<Button variant="blank" size="xl-icon" class="mx-auto mb-2" as-child>
					<NuxtLink to="/demo">
						<LogoCrateGuide />
					</NuxtLink>
				</Button>
				<CardTitle class="text-2xl">Demo</CardTitle>
				<CardDescription>Coming soon</CardDescription>
			</CardHeader>
			<CardContent class="grid gap-4">
				<p class="text-muted-foreground text-center text-sm">
					The demo is currently under construction.
				</p>
				<Button v-if="!user" as-child class="w-full">
					<NuxtLink to="/login">Back to login</NuxtLink>
				</Button>
				<Button v-else as-child class="w-full">
					<NuxtLink to="/">Go to app</NuxtLink>
				</Button>
			</CardContent>
		</Card>
	</div>
</template>
