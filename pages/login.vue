<script setup lang="ts">
import { toast } from 'vue-sonner'

definePageMeta({ layout: 'blank' })

const supabase = useSupabaseClient()
const router = useRouter()

const signingIn = ref(false)
const signingInWithGithub = ref(false)
const signingInWithGoogle = ref(false)

const email = ref('')
const password = ref('')

async function signIn() {
	signingIn.value = true
	try {
		const { error } = await supabase.auth.signInWithPassword({
			email: email.value,
			password: password.value
		})
		if (error) throw error
		toast.success(`Sign in successful!`)
		router.push({ path: '/' })
	} catch (error) {
		toast.error(`Error signing in.`)
	}
	signingIn.value = false
}

async function signInWithGithub() {
	signingInWithGithub.value = true
	try {
		const { error } = await supabase.auth.signInWithOAuth({
			provider: 'github'
		})
		if (error) throw error
		toast.success(`Sign in successful!`)
		router.push({ path: '/' })
	} catch (error) {
		toast.error(`Error signing in.`)
	}
	signingInWithGithub.value = false
}

async function signInWithGoogle() {
	signingInWithGoogle.value = true
	try {
		const { error } = await supabase.auth.signInWithOAuth({
			provider: 'google'
		})
		if (error) throw error
		toast.success(`Sign in successful!`)
		router.push({ path: '/' })
	} catch (error) {
		toast.error(`Error signing in.`)
	}
	signingInWithGoogle.value = false
}
</script>

<template>
	<div class="flex items-center justify-center h-screen">
		<Card class="max-w-md w-full p-6 bg-white rounded-lg shadow-md">
			<CardHeader class="space-y-1">
				<CardTitle class="text-2xl">Log in</CardTitle>
				<CardDescription>Welcome back, log in with</CardDescription>
			</CardHeader>
			<CardContent class="grid gap-4">
				<div class="grid grid-cols-2 gap-4">
					<Button variant="outline" @click="signInWithGithub">
						<IconGithub class="mr-2 w-4" />
						GitHub
					</Button>
					<Button variant="outline" @click="signInWithGoogle">
						<IconGoogle class="mr-2 w-4" />
						Google
					</Button>
				</div>
				<div class="relative pb-1">
					<div class="absolute inset-0 flex items-center">
						<span class="w-full border-t" />
					</div>
					<div class="relative flex justify-center">
						<span class="bg-background px-2 text-muted-foreground">or</span>
					</div>
				</div>
				<div class="grid gap-2">
					<Label for="email">Email</Label>
					<Input
						id="email"
						v-model="email"
						type="email"
						placeholder="user@domain.com"
					/>
				</div>
				<div class="grid gap-2">
					<Label for="password">Password</Label>
					<Input id="password" v-model="password" type="password" />
				</div>
			</CardContent>
			<CardFooter class="flex-col gap-4">
				<Button class="w-full" :loading="true" @click="signIn">Sign in</Button>
				<span>
					Don't have an account?
					<Button variant="link" as-child>
						<NuxtLink to="/signup">Sign up</NuxtLink>
					</Button>
				</span>
			</CardFooter>
		</Card>
	</div>
</template>
