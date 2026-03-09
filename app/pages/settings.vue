<script setup lang="ts">
const user = useUserStore()
</script>

<template>
	<div class="scrollbar-hidden flex-1 overflow-y-auto">
		<div class="mx-auto w-full max-w-2xl px-6 pt-6 pb-14">
			<div class="space-y-8">
				<div class="space-y-2">
					<h1 class="text-2xl font-semibold">Settings</h1>
					<p v-if="user.supaUser" class="text-muted-foreground">
						Welcome back,
						{{ user.supaUser.user_metadata?.full_name || user.supaUser.email }}
					</p>
				</div>

				<Card class="gap-4">
					<CardHeader class="pb-0">
						<CardTitle>Discogs Integration</CardTitle>
						<CardDescription>
							Connect your Discogs account to import and sync collection data.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<DetailsDiscogsAuth :show-heading="false" />
					</CardContent>
				</Card>

				<Card class="gap-4">
					<CardHeader class="pb-0">
						<CardTitle>Appearance</CardTitle>
						<CardDescription>
							Choose a theme and turntable color for the interface.
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

				<Card v-if="user.supaUser" class="gap-4">
					<CardHeader class="pb-0">
						<CardTitle>Account</CardTitle>
						<CardDescription>
							Manage your current authenticated session.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div
							class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
						>
							<div class="space-y-1">
								<p class="text-sm font-medium">
									{{
										user.supaUser.user_metadata?.full_name || 'Signed in user'
									}}
								</p>
								<p class="text-muted-foreground text-sm">
									{{ user.supaUser.email }}
								</p>
							</div>
							<Button variant="outline" @click="user.signOut">Log out</Button>
						</div>
					</CardContent>
				</Card>

				<Card v-if="user.supaUser" class="border-destructive/50 gap-4">
					<CardHeader class="pb-0">
						<CardTitle class="text-destructive">Danger Zone</CardTitle>
						<CardDescription>
							Permanent actions that remove collection data.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div
							class="bg-destructive/5 border-destructive/20 flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
						>
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
