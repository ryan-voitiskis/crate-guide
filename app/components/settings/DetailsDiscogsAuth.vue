<script setup lang="ts">
import { KeyRound, User } from 'lucide-vue-next'

const user = useUserStore()
const discogsAuth = useDiscogsAuthStore()
const props = withDefaults(defineProps<{ showHeading?: boolean }>(), {
	showHeading: true
})
</script>

<template>
	<div class="space-y-2">
		<h2 v-if="props.showHeading" class="leading-none font-medium">
			Discogs Integration
		</h2>
		<div v-if="user.profile?.discogs_username" class="space-y-2">
			<span class="text-muted-foreground text-sm">
				Crate Guide is connected to your Discogs account
			</span>
			<div class="flex items-center gap-2">
				<Avatar class="bg-primary text-primary-foreground cursor-pointer">
					<AvatarImage
						v-if="user.profile.discogs_avatar_url"
						:src="user.profile.discogs_avatar_url"
						alt="Your Discogs avatar"
					/>
					<AvatarFallback><User class="size-7" /></AvatarFallback>
				</Avatar>
				<span class="text-sm font-medium">
					{{ user.profile.discogs_username }}
				</span>
				<DialogDiscogsDisconnect />
			</div>
		</div>
		<div v-else>
			<p class="text-muted-foreground text-sm">
				Connect Crate Guide to your Discogs account so you can import your
				collection.
			</p>
			<Button
				class="my-2 w-full"
				variant="secondary"
				:loading="discogsAuth.isDiscogsConnecting"
				@click="discogsAuth.initDiscogsOAuthFlow"
			>
				<KeyRound class="mr-2" />
				Connect to Discogs
			</Button>
		</div>
	</div>
</template>
