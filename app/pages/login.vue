<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import * as z from 'zod'

definePageMeta({ keepalive: false })

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
		if (newUser) void router.replace('/')
	},
	{ immediate: true }
)
</script>

<template>
	<ShellAuth chip="Side A · Sign in" title="Log in" catalog="CG · A01">
		<template #header-extras>
			<NoticeWarning v-if="user.userAlreadyRegistered">
				<template #title>
					It looks like you've already created an account
				</template>
				Try sign in with GitHub or Google, or enter your email and password
			</NoticeWarning>
		</template>

		<div class="grid gap-4">
			<div class="grid grid-cols-2 gap-3">
				<ButtonLoading
					variant="outline"
					:loading="signingInWithGithub"
					:disabled="signingInWithGoogle || form.isSubmitting.value"
					@click="signInWithGithub"
				>
					<IconGithub class="mr-2 size-5" />
					GitHub
				</ButtonLoading>
				<ButtonLoading
					variant="outline"
					:loading="signingInWithGoogle"
					:disabled="signingInWithGithub || form.isSubmitting.value"
					@click="signInWithGoogle"
				>
					<IconGoogle class="mr-2 size-5" />
					Google
				</ButtonLoading>
			</div>

			<SeparatorLabelled label="OR" class="my-1" />

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

				<ButtonLoading
					class="mt-2 w-full"
					type="submit"
					:disabled="signingInWithGithub || signingInWithGoogle"
					:loading="form.isSubmitting.value"
				>
					Sign in
				</ButtonLoading>
			</form>

			<div class="flex flex-col gap-1 pt-1 text-center text-sm">
				<div>
					<span class="text-muted-foreground">Forgot your password?</span>
					<Button variant="link" as-child>
						<NuxtLink to="/reset-password">Reset it</NuxtLink>
					</Button>
				</div>
				<div>
					<span class="text-muted-foreground">Don't have an account?</span>
					<Button variant="link" as-child>
						<NuxtLink to="/signup">Sign up</NuxtLink>
					</Button>
				</div>
			</div>

			<Separator class="my-1" />

			<div class="text-muted-foreground text-center text-sm">
				<p>Not ready to create an account?</p>
				<Button variant="link" as-child>
					<NuxtLink to="/demo">View the demo</NuxtLink>
				</Button>
			</div>
		</div>
	</ShellAuth>
</template>
