<script setup lang="ts">
const user = useUserStore()
</script>

<template>
	<div class="grid gap-4">
		<div class="space-y-2">
			<h4 class="font-medium leading-none">
				Welcome back
				{{ user.supaUser.user_metadata.full_name || user.supaUser.email }}
			</h4>
			<p class="text-sm text-muted-foreground">
				This text hasn't been decided upon yet.
			</p>
			<pre>{{ user.profile }}</pre>
		</div>
		<ThemeToggle />
		<div class="flex">
			<Button v-if="user.supaUser" @click="user.signOut">Logout</Button>
		</div>
	</div>
</template>
