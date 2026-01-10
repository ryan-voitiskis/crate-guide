<script setup lang="ts">
const user = useUserStore()
const discogsAuth = useDiscogsAuthStore()
</script>

<template>
	<div class="scrollbar-hidden flex-1 overflow-y-auto">
		<div class="mx-auto flex h-full w-full max-w-2xl flex-col space-y-6 p-6">
			<div class="space-y-2">
				<h1 class="text-2xl font-semibold">Settings</h1>
				<p v-if="user.supaUser" class="text-muted-foreground">
					Welcome back,
					{{ user.supaUser.user_metadata.full_name || user.supaUser.email }}
				</p>
			</div>

			<div class="flex flex-col gap-6">
				<Card>
					<CardHeader>
						<CardTitle>Discogs Integration</CardTitle>
					</CardHeader>
					<CardContent>
						<DetailsDiscogsAuth />
					</CardContent>
				</Card>

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

				<Card v-if="user.supaUser">
					<CardContent class="pt-6">
						<Button @click="user.signOut" variant="destructive">Log out</Button>
					</CardContent>
				</Card>

				<Card v-if="user.supaUser" class="border-destructive/50">
					<CardHeader>
						<CardTitle class="text-destructive">Danger Zone</CardTitle>
					</CardHeader>
					<CardContent class="space-y-4">
						<div class="flex items-center justify-between gap-4">
							<div class="space-y-1">
								<p class="text-sm font-medium">Clear all data</p>
								<p class="text-muted-foreground text-sm">
									Permanently delete all your records and tracks. This cannot be
									undone.
								</p>
							</div>
							<DialogClearAllData />
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	</div>
</template>
