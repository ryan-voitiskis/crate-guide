<script setup lang="ts">
const supabase = useSupabaseClient()
const user = useSupabaseUser()

async function signOut() {
	const { error } = await supabase.auth.signOut()
	if (error) {
		// TODO: toast error.message
	}
}

const profile = ref<Profile | null>(null)

onMounted(async () => {
	const { data, error } = await supabase
		.from('profiles')
		.select()
		.eq('id', user.value.id)
		.single()
	if (error) {
		// TODO: toast error.message
	} else profile.value = data
})
</script>

<template>
	<Popover>
		<PopoverTrigger as-child>
			<Avatar class="bg-slate-200 cursor-pointer">
				<AvatarImage :src="user.user_metadata.avatar_url" alt="Your avatar" />
				<AvatarFallback><IconUser class="h-7 w-7" /></AvatarFallback>
			</Avatar>
		</PopoverTrigger>
		<PopoverContent side="bottom" align="end" :side-offset="5" class="w-80">
			<div class="grid gap-4">
				<div class="space-y-2">
					<h4 class="font-medium leading-none">
						Welcome back {{ user.user_metadata.full_name || user.email }}
					</h4>
					<p class="text-sm text-muted-foreground">
						This text hasn't been decided upon yet.
					</p>
					<pre>{{ profile }}</pre>
				</div>
				<div class="flex">
					<Button v-if="user" @click="signOut">Logout</Button>
				</div>
			</div>
		</PopoverContent>
	</Popover>
</template>
