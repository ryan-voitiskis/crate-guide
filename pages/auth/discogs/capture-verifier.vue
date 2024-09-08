<script setup lang="ts">
import { FunctionsError } from '@supabase/supabase-js'

const route = useRoute()
const supabase = useSupabaseClient<Database>()

const failed = ref(false)

onMounted(async () => {
	const oauth_token = route.query.oauth_token as string
	const oauth_verifier = route.query.oauth_verifier as string

	const { error } = await supabase.functions.invoke('getDiscogsAccessToken', {
		body: JSON.stringify({ oauth_token, oauth_verifier })
	})
	if (error instanceof FunctionsError) failed.value = true
	else navigateTo('/')
})
</script>

<template>
	<div class="flex h-screen w-full items-center justify-center">
		<div v-if="!failed" class="flex flex-col items-center justify-center gap-4">
			<LoadingSpinner class="h-24 w-24 text-primary/30" />
			<div class="text-lg text-muted-foreground">
				Authenticating with Discogs...
			</div>
		</div>

		<div v-if="failed" class="flex max-w-md flex-col gap-6">
			<NoticeWarning>
				<template #title>
					<IconTriangleAlert class="mr-1 inline h-5 w-5" />
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
