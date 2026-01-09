<script setup lang="ts">
import { Disc, Music, Radio, Settings } from 'lucide-vue-next'

const user = useUserStore()
const ui = useUiStore()
</script>

<template>
	<Tabs v-model="ui.tab" default-value="tracks" class="relative h-full">
		<!-- Tab navigation overlay -->
		<div
			class="from-background pointer-events-none absolute inset-x-0 top-0 z-10 mx-auto flex max-w-[1600px] justify-center bg-gradient-to-b to-transparent p-2"
		>
			<div class="pointer-events-auto flex w-full justify-end">
				<TabsList class="border-1">
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
		</div>

		<!-- Tab content - full height with top padding for tabs -->
		<TabsContent value="session" class="h-full pt-13">
			<TabSession />
		</TabsContent>
		<TabsContent
			value="tracks"
			class="scrollbar-hidden h-full overflow-y-auto pt-13"
		>
			<div class="mx-auto max-w-[1600px]">
				<TabTracks />
			</div>
		</TabsContent>
		<TabsContent
			value="records"
			class="scrollbar-hidden h-full overflow-y-auto pt-13"
		>
			<div class="mx-auto max-w-[1600px]">
				<TabRecords />
			</div>
		</TabsContent>
		<TabsContent
			value="settings"
			class="scrollbar-hidden h-full overflow-y-auto pt-13"
		>
			<div class="mx-auto max-w-[1600px]">
				<TabSettings />
			</div>
		</TabsContent>
	</Tabs>
</template>
