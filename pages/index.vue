<script setup lang="ts">
const user = useUserStore()

const activeTab = ref('session')
</script>

<template>
	<Tabs
		v-model="activeTab"
		default-value="session"
		class="flex flex-col w-full max-w-[1600px] mx-auto"
	>
		<div class="flex w-full justify-between p-2">
			<TabsList>
				<TabsTrigger value="session" class="w-32">Session</TabsTrigger>
				<TabsTrigger value="collection" class="w-32">Collection</TabsTrigger>
			</TabsList>
			<UserSettings v-if="user.supaUser" />
			<div v-else class="flex gap-4">
				<Button as-child variant="ghost">
					<NuxtLink to="/signup">Sign up</NuxtLink>
				</Button>
				<Button as-child variant="ghost">
					<NuxtLink to="/login">Log in</NuxtLink>
				</Button>
			</div>
		</div>
		<TabsContent value="session">Session</TabsContent>
		<TabsContent value="collection">Collection</TabsContent>
	</Tabs>
</template>
