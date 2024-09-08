<script setup lang="ts">
const user = useUserStore()
</script>

<template>
	<Popover>
		<PopoverTrigger as-child>
			<Avatar class="bg-primary text-primary-foreground cursor-pointer">
				<AvatarImage
					v-if="user.supaUser.user_metadata.avatar_url"
					:src="user.supaUser.user_metadata.avatar_url"
					alt="Your avatar"
				/>
				<AvatarFallback><IconUser class="h-7 w-7" /></AvatarFallback>
			</Avatar>
		</PopoverTrigger>
		<PopoverContent side="bottom" align="end" :side-offset="5" class="w-120">
			<div class="grid gap-4">
				<div class="space-y-2">
					<h2 class="font-medium leading-none">
						Welcome back
						{{ user.supaUser.user_metadata.full_name || user.supaUser.email }}
					</h2>
					<p class="text-sm text-muted-foreground">
						This text hasn't been decided upon yet.
					</p>
					<pre class="text-xs">{{ user.profile }}</pre>
				</div>
				<ManageDiscogsOAuth />
				<ThemeToggle />
				<div class="flex">
					<Button v-if="user.supaUser" @click="user.signOut">Logout</Button>
				</div>
			</div>
		</PopoverContent>
	</Popover>
</template>
