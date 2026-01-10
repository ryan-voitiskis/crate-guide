<script setup lang="ts">
import { Ellipsis } from 'lucide-vue-next'

const user = useUserStore()

const showDialog = ref(false)
</script>

<template>
	<Button
		variant="ghost"
		size="icon"
		class="rounded-full"
		@click="showDialog = true"
	>
		<Ellipsis />
	</Button>

	<Dialog v-model:open="showDialog">
		<DialogContent class="sm:max-w-[425px]">
			<DialogHeader>
				<DialogTitle>crate guide config</DialogTitle>
				<p v-if="user.supaUser" class="text-muted-foreground text-sm">
					Welcome back
					{{ user.supaUser.user_metadata.full_name || user.supaUser.email }}
				</p>
			</DialogHeader>
			<DetailsDiscogsAuth />
			<SelectorTurntableColor />
			<SelectorTheme />
			<SelectPitchRange />
			<div class="flex">
				<Button v-if="user.supaUser" @click="user.signOut">Logout</Button>
			</div>
			<DialogFooter></DialogFooter>
		</DialogContent>
	</Dialog>
</template>
