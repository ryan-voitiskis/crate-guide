<script setup lang="ts">
const user = useUserStore()
</script>

<template>
	<Popover>
		<PopoverTrigger as-child>
			<Avatar class="cursor-pointer bg-primary text-primary-foreground">
				<AvatarImage
					v-if="user.supaUser.user_metadata.avatar_url"
					:src="user.supaUser.user_metadata.avatar_url"
					alt="Your avatar"
				/>
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
				<h2 class="font-medium leading-none">
					Welcome back
					{{ user.supaUser.user_metadata.full_name || user.supaUser.email }}
				</h2>
				<p class="text-sm text-muted-foreground">
					This text hasn't been decided upon yet.
				</p>
			</div>
			<ManageDiscogsOAuth />
			<TurntableColourToggle />
			<ThemeToggle />
			<div class="flex">
				<Button v-if="user.supaUser" @click="user.signOut">Logout</Button>
			</div>
		</PopoverContent>
	</Popover>
</template>
