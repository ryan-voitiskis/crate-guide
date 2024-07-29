<script setup lang="ts">
const supabase = useSupabaseClient()
const router = useRouter()

definePageMeta({ layout: 'blank' })

const email = ref('')
const password = ref('')

async function handleSignUp() {
	try {
		const { error } = await supabase.auth.signUp({
			email: email.value,
			password: password.value
		})
		if (error) throw error
		router.push({ path: '/' })
	} catch (error) {
		console.error('Error signing up:', error)
	}
}
</script>

<template>
	<div class="flex items-center justify-center h-screen">
		<Card class="max-w-md w-full p-6 bg-white rounded-lg shadow-md">
			<CardHeader class="space-y-1">
				<CardTitle class="text-2xl">Create an account</CardTitle>
				<CardDescription>
					Enter your email below to create your account
				</CardDescription>
			</CardHeader>
			<CardContent class="grid gap-4">
				<div class="grid grid-cols-2 gap-6">
					<Button variant="outline">
						<IconGithub class="mr-2 w-4" />
						GitHub
					</Button>
					<Button variant="outline">
						<IconGoogle class="mr-2 w-4" />
						Google
					</Button>
				</div>
				<div class="relative">
					<div class="absolute inset-0 flex items-center">
						<span class="w-full border-t" />
					</div>
					<div class="relative flex justify-center text-xs uppercase">
						<span class="bg-background px-2 text-muted-foreground">
							Or continue with
						</span>
					</div>
				</div>
				<div class="grid gap-2">
					<Label for="email">Email</Label>
					<Input
						id="email"
						v-model="email"
						type="email"
						placeholder="old_mate@example.com"
					/>
				</div>
				<div class="grid gap-2">
					<Label for="password">Password</Label>
					<Input id="password" v-model="password" type="password" />
				</div>
			</CardContent>
			<CardFooter>
				<Button class="w-full" @click="handleSignUp">Create account</Button>
			</CardFooter>
		</Card>
	</div>
</template>
