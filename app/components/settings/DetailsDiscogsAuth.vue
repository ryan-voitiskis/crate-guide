<script setup lang="ts">
import { KeyRound, User } from 'lucide-vue-next'

const user = useWorkbenchUserStore()
const discogsAuth = useWorkbenchDiscogsAuthStore()
const props = withDefaults(
	defineProps<{ showHeading?: boolean; readOnly?: boolean }>(),
	{
		showHeading: true,
		readOnly: false
	}
)
</script>

<template>
	<div class="space-y-2">
		<h2 v-if="props.showHeading" class="leading-none font-medium">
			Discogs Integration
		</h2>
		<div
			v-if="!props.readOnly && user.profile?.discogs_username"
			class="space-y-2"
		>
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
			<ButtonLoading
				class="my-2 w-full"
				variant="secondary"
				:loading="discogsAuth.isDiscogsConnecting"
				:disabled="props.readOnly"
				:title="
					props.readOnly
						? 'Discogs connection is disabled in the demo'
						: undefined
				"
				@click="discogsAuth.initDiscogsOAuthFlow"
			>
				<KeyRound class="mr-2" />
				Connect to Discogs
			</ButtonLoading>
		</div>
	</div>
</template>
