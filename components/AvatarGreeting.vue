<script setup lang="ts">
const user = useUserStore()
</script>

<template>
	<Popover>
		<PopoverTrigger as-child>
			<Avatar class="bg-slate-200 cursor-pointer">
				<AvatarImage
					:src="user.supaUser.user_metadata.avatar_url"
					alt="Your avatar"
				/>
				<AvatarFallback><IconUser class="h-7 w-7" /></AvatarFallback>
			</Avatar>
		</PopoverTrigger>
		<PopoverContent side="bottom" align="end" :side-offset="5" class="w-80">
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
				<div class="flex">
					<Button v-if="user.supaUser" @click="user.signOut">Logout</Button>
				</div>
			</div>
		</PopoverContent>
	</Popover>
</template>
