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
	<div class="w-full h-screen flex justify-center items-center">
		<div v-if="!failed" class="flex justify-center items-center flex-col gap-4">
			<LoadingSpinner class="w-24 h-24 text-primary/30" />
			<div class="text-lg text-muted-foreground">
				Authenticating with Discogs...
			</div>
		</div>

		<div v-if="failed" class="max-w-md flex flex-col gap-6">
			<NoticeWarning>
				<template #title>
					<IconTriangleAlert class="w-5 h-5 mr-1 inline" />
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
