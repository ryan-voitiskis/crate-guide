<script setup lang="ts">
const user = useSupabaseUser()
</script>

<template>
	<div class="scrollbar-hidden flex-1 overflow-y-auto">
		<div class="mx-auto flex h-full w-full max-w-2xl flex-col space-y-6 p-6">
			<div class="space-y-2">
				<h1 class="text-2xl font-semibold">Demo Settings</h1>
				<p class="text-muted-foreground">
					Customize the app experience. Settings are not saved in demo mode.
				</p>
			</div>

			<div class="flex flex-col gap-6">
				<Card>
					<CardHeader>
						<CardTitle>Appearance</CardTitle>
					</CardHeader>
					<CardContent class="space-y-6">
						<SelectorTheme />
						<Separator />
						<SelectorTurntableColor />
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Turntable Settings</CardTitle>
					</CardHeader>
					<CardContent>
						<SelectPitchRange />
					</CardContent>
				</Card>

				<Card>
					<CardContent class="pt-6">
						<div class="flex flex-col gap-2">
							<Button v-if="!user" as-child class="w-full">
								<NuxtLink to="/login">Sign in to save your data</NuxtLink>
							</Button>
							<Button v-else as-child variant="outline" class="w-full">
								<NuxtLink to="/">Go to app</NuxtLink>
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	</div>
</template>
