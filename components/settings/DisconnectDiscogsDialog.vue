<script setup lang="ts">
import { toast } from 'vue-sonner'

const user = useUserStore()
const supabase = useSupabaseClient<Database>()

const isDiscogsDisconnecting = ref(false)

async function disconnectDiscogs() {
	isDiscogsDisconnecting.value = true
	const { data, error } = await supabase
		.from('profiles')
		.update({
			discogs_username: null,
			discogs_request_token: null,
			discogs_request_secret: null,
			discogs_access_token: null,
			discogs_access_secret: null,
			discogs_avatar_url: null
		})
		.eq('id', user.profile!.id)
		.select()
	if (error) toast.error('Error disconnecting Discogs.')
	else {
		toast.success('Discogs disconnected.')
		user.profile = data[0]
	}
}
</script>

<template>
	<Dialog>
		<DialogTrigger as-child>
			<Button variant="secondary" class="ml-auto">Disconnect</Button>
		</DialogTrigger>
		<DialogContent class="sm:max-w-[425px]">
			<DialogHeader>
				<DialogTitle>Disconnect Discogs</DialogTitle>
				<div class="text-sm text-muted-foreground">
					<p>
						Are you sure you want to disconnect Crate Guide from your Discogs
						account?
					</p>
					<p>
						You will no longer be able to import your collection or complete any
						actions requiring this connection. Although your collection will
						remain in your Crate Guide library. You can always reconnect later.
					</p>
				</div>
			</DialogHeader>
			<DialogFooter>
				<Button
					@click="disconnectDiscogs"
					variant="destructive"
					:loading="isDiscogsDisconnecting"
				>
					Disconnect
				</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
</template>
