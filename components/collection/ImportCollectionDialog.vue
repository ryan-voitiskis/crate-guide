<script setup lang="ts">
import { toast } from 'vue-sonner'

const discogs = useDiscogsStore()
const user = useUserStore()
const supabase = useSupabaseClient<Database>()

type Folder = {
	id: number
	name: string
	count: number
}

const gettingFolders = ref(false)
const folders = ref<Folder[]>([])

async function getUsersDiscogsFolders() {
	gettingFolders.value = true
	console.log(
		`https://api.discogs.com/users/${user.profile?.discogs_username}/collection/folders`
	)
	const url = `https://api.discogs.com/users/${user.profile?.discogs_username}/collection/folders`
	const url2 = `https://api.discogs.com/oauth/identity`
	const { data, error } = await supabase.functions.invoke(
		'authenticatedDiscogsRequest',
		{
			body: JSON.stringify({
				httpMethod: 'GET',
				url: url
			})
		}
	)
	console.log(data)

	if (error) toast.error('Error fetching folders.')
	if (!data.folders) toast.error('No folders found.')
	else {
		folders.value = data.folders
	}
	gettingFolders.value = false
}
</script>

<template>
	<Dialog @update:open="getUsersDiscogsFolders">
		<DialogTrigger as-child>
			<Button variant="secondary" class="ml-auto">
				Import Discogs Collection
			</Button>
		</DialogTrigger>
		<DialogContent class="sm:max-w-[425px]">
			<DialogHeader>
				<DialogTitle>Import Discogs Collection</DialogTitle>
				<div class="text-sm text-muted-foreground">
					<p>
						Lorem ipsum dolor sit amet consectetur, adipisicing elit. Doloribus
						dolor ratione vero delectus officiis porro omnis! Praesentium
						facilis aut illo numquam est delectus possimus pariatur, soluta
						nobis rem et quis?
					</p>
				</div>
				<LoadingSpinner
					v-if="gettingFolders"
					class="mx-auto h-16 w-16 text-primary/30"
				/>
				<div v-else>
					<div v-for="folder in folders" :key="folder.id">
						{{ folder.name }} ({{ folder.count }})
					</div>
				</div>
			</DialogHeader>
			<DialogFooter>
				<!-- <Button
					@click="disconnectDiscogs"
					variant="destructive"
					:loading="isDiscogsDisconnecting"
				>
					Disconnect
				</Button> -->
			</DialogFooter>
		</DialogContent>
	</Dialog>
</template>
