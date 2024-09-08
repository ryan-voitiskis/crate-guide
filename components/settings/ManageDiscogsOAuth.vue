<script setup lang="ts">
import { toast } from 'vue-sonner'

const user = useUserStore()
const supabase = useSupabaseClient<Database>()

const isDiscogsConnecting = ref(false)

/*
 * This function is used to initialise the Discogs OAuth flow.
 * After request token is retrieved, the user is redirected to Discogs for authentication.
 * After authentication, the user is redirected back to the app, where the verifier is captured.
 * Finally, the access token is retrieved and saved to the user's profile.
 * See: capture-verifier.vue
 */
async function initDiscogsOAuthFlow() {
	isDiscogsConnecting.value = true
	const { data, error } = await supabase.functions.invoke(
		'getDiscogsRequestToken'
	)
	if (error) toast.error('Error authenticating with Discogs.')
	else if (data)
		window.location.href = `https://discogs.com/oauth/authorize?oauth_token=${data}`
	else isDiscogsConnecting.value = false
}
</script>

<template>
	<div class="space-y-2">
		<h2 class="font-medium leading-none">Discogs Integration</h2>
		<div v-if="user.profile?.discogs_username" class="space-y-2">
			<span class="text-sm text-muted-foreground">
				Crate Guide is connected to your Discogs account
			</span>
			<div class="flex items-center gap-2">
				<Avatar class="cursor-pointer bg-primary text-primary-foreground">
					<AvatarImage
						v-if="user.profile.discogs_avatar_url"
						:src="user.profile.discogs_avatar_url"
						alt="Your Discogs avatar"
					/>
					<AvatarFallback><IconUser class="h-7 w-7" /></AvatarFallback>
				</Avatar>
				<span class="text-sm font-medium">
					{{ user.profile.discogs_username }}
				</span>
				<DisconnectDiscogsDialog />
			</div>
		</div>
		<div v-else>
			<p class="text-sm text-muted-foreground">
				Connect Crate Guide to your Discogs account so you can import your
				collection.
			</p>
			<Button
				@click="initDiscogsOAuthFlow"
				variant="secondary"
				:loading="isDiscogsConnecting"
			>
				Authenticate with Discogs
			</Button>
		</div>
	</div>
</template>
