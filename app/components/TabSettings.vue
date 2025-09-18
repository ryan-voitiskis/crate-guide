<script setup lang="ts">
const user = useUserStore()
const discogsAuth = useDiscogsAuthStore()
</script>

<template>
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
					<Button @click="user.signOut" variant="destructive">
						Log out
					</Button>
				</CardContent>
			</Card>
		</div>
	</div>
</template>
