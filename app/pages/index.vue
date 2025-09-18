<script setup lang="ts">
import { Disc, Music, Radio, Settings } from 'lucide-vue-next'

const user = useUserStore()
const ui = useUiStore()
</script>

<template>
	<Tabs
		v-model="ui.tab"
		default-value="tracks"
		class="mx-auto flex w-full max-w-[1600px] flex-col p-0"
	>
		<div class="flex w-full justify-between p-2">
			<TabsList>
				<TabsTrigger value="session" class="flex items-center gap-1.5">
					<Radio class="size-4" />
					Session
				</TabsTrigger>
				<TabsTrigger value="tracks" class="flex items-center gap-1.5">
					<Music class="size-4" />
					Tracks
				</TabsTrigger>
				<TabsTrigger value="records" class="flex items-center gap-1.5">
					<Disc class="size-4" />
					Records
				</TabsTrigger>
				<TabsTrigger value="settings" class="flex items-center gap-1.5">
					<Settings class="size-4" />
					Settings
				</TabsTrigger>
			</TabsList>
			<div v-if="!user.supaUser" class="flex gap-4">
				<Button as-child variant="ghost">
					<NuxtLink to="/signup">Sign up</NuxtLink>
				</Button>
				<Button as-child variant="ghost">
					<NuxtLink to="/login">Log in</NuxtLink>
				</Button>
			</div>
		</div>

		<TabsContent value="session">
			<TabSession />
		</TabsContent>
		<TabsContent value="tracks">
			<TabTracks />
		</TabsContent>
		<TabsContent value="records">
			<TabRecords />
		</TabsContent>
		<TabsContent value="settings">
			<TabSettings />
		</TabsContent>
	</Tabs>
</template>
