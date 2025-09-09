<script setup lang="ts">
import { TriangleAlert } from 'lucide-vue-next'

const discogsAuth = useDiscogsAuthStore()

onMounted(async () => await discogsAuth.completeDiscogsOAuth())
</script>

<template>
	<div class="flex h-screen w-full items-center justify-center">
		<div
			v-if="!discogsAuth.oAuthCompletionFailed"
			class="flex flex-col items-center justify-center gap-4"
		>
			<SpinnerLoading class="text-primary/30 h-24 w-24" />
			<div class="text-muted-foreground text-lg">
				Authenticating with Discogs...
			</div>
		</div>

		<div v-else class="flex max-w-md flex-col gap-6">
			<NoticeWarning>
				<template #title>
					<TriangleAlert class="mr-1 inline h-5 w-5" />
					Failed to authenticate with Discogs.
				</template>
				An error occurred while authenticating with Discogs. Please go back and
				try again.
			</NoticeWarning>

			<Button as-child variant="ghost">
				<NuxtLink to="/">Go back</NuxtLink>
			</Button>
		</div>
	</div>
</template>
