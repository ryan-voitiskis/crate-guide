<script setup lang="ts">
const user = useUserStore()
</script>

<template>
	<Popover>
		<PopoverTrigger as-child>
			<Avatar class="bg-slate-200 cursor-pointer">
				<AvatarImage
					v-if="user.supaUser.user_metadata.avatar_url"
					:src="user.supaUser.user_metadata.avatar_url"
					alt="Your avatar"
				/>
				<AvatarFallback><IconUser class="h-7 w-7" /></AvatarFallback>
			</Avatar>
		</PopoverTrigger>
		<PopoverContent side="bottom" align="end" :side-offset="5" class="w-120">
			<SettingsControl />
		</PopoverContent>
	</Popover>
</template>
