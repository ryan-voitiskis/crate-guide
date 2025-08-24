<script setup lang="ts">
const user = useUserStore()

const avatarImg = computed(() => {
	return (
		user.supaUser.user_metadata.avatar_url ??
		user.profile?.discogs_avatar_url ??
		null
	)
})
</script>

<template>
	<Popover>
		<PopoverTrigger as-child>
			<Avatar class="bg-primary text-primary-foreground cursor-pointer">
				<AvatarImage v-if="avatarImg" :src="avatarImg" alt="Your avatar" />
				<AvatarFallback><IconUser class="h-7 w-7" /></AvatarFallback>
			</Avatar>
		</PopoverTrigger>
		<PopoverContent
			side="bottom"
			align="end"
			:side-offset="5"
			class="flex w-full max-w-[96vw] flex-col gap-4 sm:max-w-96"
		>
			<div class="space-y-2">
				<h2 class="leading-none font-medium">
					Welcome back
					{{ user.supaUser.user_metadata.full_name || user.supaUser.email }}
				</h2>
				<p class="text-muted-foreground text-sm">
					This text hasn't been decided upon yet.
				</p>
			</div>
			<ManageDiscogsOAuth />
			<TurntableColourToggle />
			<ThemeToggle />
			<PitchRangeSelect />
			<div class="flex">
				<Button v-if="user.supaUser" @click="user.signOut">Logout</Button>
			</div>
		</PopoverContent>
	</Popover>
</template>
