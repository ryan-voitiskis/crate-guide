<script setup lang="ts">
import { toast } from 'vue-sonner'
import { KeyRound } from 'lucide-vue-next'
import { User } from 'lucide-vue-next'

const user = useUserStore()
const discogsAuth = useDiscogsAuthStore()
</script>

<template>
	<div class="space-y-2">
		<h2 class="leading-none font-medium">Discogs Integration</h2>
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
				@click="discogsAuth.initDiscogsOAuthFlow"
				:loading="discogsAuth.isDiscogsConnecting"
			>
				<KeyRound class="mr-2" />
				Connect to Discogs
			</Button>
		</div>
	</div>
</template>
