<script setup lang="ts">
const user = useSupabaseUser()
</script>

<template>
	<div class="scrollbar-hidden flex-1 overflow-y-auto">
		<div class="mx-auto w-full max-w-2xl px-6 pt-6 pb-14">
			<div class="space-y-8">
				<div class="space-y-2">
					<h1 class="text-2xl font-semibold">Demo Settings</h1>
					<p class="text-muted-foreground">
						Customize the app experience. Settings are not saved in demo mode.
					</p>
				</div>

				<Card class="gap-4">
					<CardHeader class="pb-0">
						<CardTitle>Appearance</CardTitle>
						<CardDescription>
							Choose theme, key format, and turntable color for the interface.
						</CardDescription>
					</CardHeader>
					<CardContent class="space-y-6">
						<SelectorTheme />
						<Separator />
						<SelectorKeyFormat />
						<Separator />
						<SelectorTurntableColor />
					</CardContent>
				</Card>

				<Card class="gap-4">
					<CardHeader class="pb-0">
						<CardTitle>Turntable Settings</CardTitle>
						<CardDescription>
							Control playback behavior for deck simulation.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<SelectPitchRange />
					</CardContent>
				</Card>

				<Card class="gap-4">
					<CardHeader class="pb-0">
						<CardTitle>Account</CardTitle>
						<CardDescription>
							Sign in to persist your settings outside demo mode.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div class="flex flex-col gap-2 sm:flex-row sm:justify-end">
							<Button v-if="!user" as-child>
								<NuxtLink to="/login">Sign in to save your data</NuxtLink>
							</Button>
							<Button v-else as-child variant="outline">
								<NuxtLink to="/">Go to app</NuxtLink>
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	</div>
</template>
