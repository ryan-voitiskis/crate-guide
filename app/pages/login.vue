<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import * as z from 'zod'

const user = useUserStore()
const router = useRouter()

const signingInWithGithub = ref(false)
const signingInWithGoogle = ref(false)

const schema = z.object({
	email: z.string().trim().email().max(254),
	password: z.string().max(64, 'Password cannot exceed 64 characters')
})

type LoginFormValues = z.infer<typeof schema>

const form = useForm({ validationSchema: toTypedSchema(schema) })

async function signInWithGithub() {
	signingInWithGithub.value = true
	const started = await user.signInWithProvider('github')
	if (!started) signingInWithGithub.value = false
}

async function signInWithGoogle() {
	signingInWithGoogle.value = true
	const started = await user.signInWithProvider('google')
	if (!started) signingInWithGoogle.value = false
}

const onSubmit = form.handleSubmit((values: LoginFormValues) =>
	user.signInWithEmail(values.email, values.password).then((success) => {
		if (success) router.push('/auth/finalising')
	})
)

watch(
	() => user.supaUser,
	(newUser) => {
		if (newUser) router.push('/')
	},
	{ immediate: true }
)
</script>

<template>
	<div class="flex h-screen items-center justify-center">
		<Card class="w-full max-w-md rounded-lg p-6 shadow-md">
			<CardHeader class="space-y-1">
				<Button variant="blank" size="xl-icon" class="mx-auto mb-2" as-child>
					<NuxtLink to="/demo">
						<LogoCrateGuide />
					</NuxtLink>
				</Button>
				<CardTitle class="text-2xl">Log in</CardTitle>
				<CardDescription v-if="user.userAlreadyRegistered">
					<NoticeWarning>
						<template #title>
							It looks like you've already created an account
						</template>
						Try sign in with GitHub or Google, or enter your email and password
					</NoticeWarning>
				</CardDescription>
				<CardDescription v-else>Welcome back, log in with</CardDescription>
			</CardHeader>
			<CardContent class="grid gap-4">
				<div class="grid grid-cols-2 gap-4">
					<Button
						variant="outline"
						:loading="signingInWithGithub"
						:disabled="signingInWithGoogle || form.isSubmitting.value"
						@click="signInWithGithub"
					>
						<IconGithub class="mr-2 size-5" />
						GitHub
					</Button>
					<Button
						variant="outline"
						:loading="signingInWithGoogle"
						:disabled="signingInWithGithub || form.isSubmitting.value"
						@click="signInWithGoogle"
					>
						<IconGoogle class="mr-2 size-5" />
						Google
					</Button>
				</div>

				<Separator label="OR" class="my-2" span-class="bg-card" />

				<form class="flex flex-col gap-3" @submit="onSubmit">
					<FormField v-slot="{ componentField }" name="email">
						<FormItem>
							<FormLabel>Email</FormLabel>
							<FormControl>
								<Input placeholder="user@domain.com" v-bind="componentField" />
							</FormControl>
							<FormMessage />
						</FormItem>
					</FormField>

					<FormField v-slot="{ componentField }" name="password">
						<FormItem>
							<FormLabel>Password</FormLabel>
							<FormControl>
								<InputPassword v-bind="componentField" />
							</FormControl>
							<FormMessage />
						</FormItem>
					</FormField>

					<Button
						class="mt-3 w-full"
						type="submit"
						:disabled="signingInWithGithub || signingInWithGoogle"
						:loading="form.isSubmitting.value"
					>
						Sign in
					</Button>
				</form>
				<span class="-mb-4 text-center">
					Forgot your password?
					<Button variant="link" as-child>
						<NuxtLink to="/reset-password">Reset it</NuxtLink>
					</Button>
				</span>
				<span class="text-center">
					Don't have an account?
					<Button variant="link" as-child>
						<NuxtLink to="/signup">Sign up</NuxtLink>
					</Button>
				</span>

				<Separator class="my-2" span-class="bg-card" />

				<div class="text-muted-foreground text-center text-sm">
					<p>Not ready to create an account?</p>
					<Button variant="link" as-child>
						<NuxtLink to="/demo">View the demo</NuxtLink>
					</Button>
				</div>
			</CardContent>
		</Card>
	</div>
</template>
