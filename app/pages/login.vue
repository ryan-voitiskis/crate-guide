<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import * as z from 'zod'
import {
	buildSignupRedirectPath,
	sanitizeAuthReturnPath
} from '../utils/authRoutes'
import { emailSchema } from '../utils/authValidation'

definePageMeta({ keepalive: false })

const user = useUserStore()
const router = useRouter()
const route = useRoute()
const returnPath = computed(() => sanitizeAuthReturnPath(route.query.redirect))
const signupPath = computed(() => buildSignupRedirectPath(returnPath.value))

user.clearAuthOperationError?.()

const signingInWithGithub = ref(false)
const signingInWithGoogle = ref(false)

const schema = z.object({
	email: emailSchema,
	password: z
		.string()
		.min(1, 'Password is required')
		.max(64, 'Password cannot exceed 64 characters')
})

type LoginFormValues = z.infer<typeof schema>

const form = useForm({ validationSchema: toTypedSchema(schema) })

async function signInWithGithub() {
	signingInWithGithub.value = true
	const started = await user.signInWithProvider('github', returnPath.value)
	if (!started) signingInWithGithub.value = false
}

async function signInWithGoogle() {
	signingInWithGoogle.value = true
	const started = await user.signInWithProvider('google', returnPath.value)
	if (!started) signingInWithGoogle.value = false
}

const onSubmit = form.handleSubmit((values: LoginFormValues) =>
	user.signInWithEmail(values.email, values.password).then((success) => {
		if (success)
			router.push({
				path: '/auth/finalising',
				query: { redirect: returnPath.value }
			})
	})
)
</script>

<template>
	<ShellAuth
		chip="Side A · Sign in"
		title="Log in"
		subtitle="Authenticate to continue to your private collection."
		catalog="CG · A01"
	>
		<template #header-extras>
			<PanelAuthStatus
				v-if="user.userAlreadyRegistered"
				class="mt-4"
				tone="pending"
				eyebrow="Existing account"
				title="It looks like you've already created an account."
				description="Use GitHub, Google, or your existing email and password to continue."
			/>
		</template>

		<div class="grid gap-4">
			<PanelAuthStatus
				v-if="user.authOperationError"
				tone="error"
				eyebrow="Authentication failed"
				:title="user.authOperationError"
			/>

			<div class="grid gap-2 sm:grid-cols-2">
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

			<SeparatorLabelled label="Email credentials" class="my-1" />

			<form class="flex flex-col gap-3" @submit="onSubmit">
				<FormField v-slot="{ componentField }" name="email">
					<FormItem>
						<FormLabel>Email</FormLabel>
						<FormControl>
							<Input
								type="email"
								autocomplete="email"
								inputmode="email"
								autocapitalize="none"
								placeholder="user@domain.com"
								v-bind="componentField"
							/>
						</FormControl>
						<FormMessage />
					</FormItem>
				</FormField>

				<FormField v-slot="{ componentField }" name="password">
					<FormItem>
						<FormLabel>Password</FormLabel>
						<FormControl>
							<InputPassword
								autocomplete="current-password"
								v-bind="componentField"
							/>
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

			<div class="grid gap-1 pt-1 text-center text-sm">
				<div>
					<span class="text-muted-foreground">Forgot your password?</span>
					<Button variant="link" as-child>
						<NuxtLink to="/reset-password">Reset it</NuxtLink>
					</Button>
				</div>
				<div>
					<span class="text-muted-foreground">Don't have an account?</span>
					<Button variant="link" as-child>
						<NuxtLink :to="signupPath">Sign up</NuxtLink>
					</Button>
				</div>
			</div>
		</div>
	</ShellAuth>
</template>
