<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import * as z from 'zod'
import {
	buildLoginRedirectPath,
	sanitizeAuthReturnPath
} from '../utils/authRoutes'
import { emailSchema, newPasswordSchema } from '../utils/authValidation'

definePageMeta({ keepalive: false })

const user = useUserStore()
const route = useRoute()
const returnPath = computed(() => sanitizeAuthReturnPath(route.query.redirect))
const loginPath = computed(() => buildLoginRedirectPath(returnPath.value))

user.clearAuthOperationError?.()

const signingInWithGithub = ref(false)
const signingInWithGoogle = ref(false)

const schema = z.object({
	email: emailSchema,
	password: newPasswordSchema
})

type SignupFormValues = z.infer<typeof schema>

const form = useForm({ validationSchema: toTypedSchema(schema) })

const onSubmit = form.handleSubmit(async (values: SignupFormValues) => {
	const didSignUp = await user.signUpWithEmail(
		values.email,
		values.password,
		returnPath.value
	)
	if (didSignUp) form.resetForm()
})

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
</script>

<template>
	<ShellAuth
		chip="Cut 02 · New record"
		title="Create your account"
		subtitle="Start a private library and keep every release, track and cue in context."
		catalog="CG · A02"
	>
		<div class="grid gap-4">
			<PanelAuthStatus
				v-if="user.authOperationError"
				tone="error"
				eyebrow="Account setup failed"
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
								autocomplete="new-password"
								v-bind="componentField"
							/>
						</FormControl>
						<FormMessage />
					</FormItem>
				</FormField>

				<ChecklistAuthPassword :password="form.values.password ?? ''" />

				<ButtonLoading
					class="mt-2 w-full"
					type="submit"
					:disabled="signingInWithGithub || signingInWithGoogle"
					:loading="form.isSubmitting.value"
				>
					Create account
				</ButtonLoading>
				<p
					class="text-muted-foreground text-center text-[11px] leading-relaxed"
				>
					By creating an account, you agree to the
					<NuxtLink
						to="/terms"
						class="text-foreground underline underline-offset-4"
					>
						Hosted Service Terms
					</NuxtLink>
					and acknowledge the
					<NuxtLink
						to="/privacy"
						class="text-foreground underline underline-offset-4"
					>
						Privacy Notice
					</NuxtLink>
					.
				</p>
			</form>

			<div class="pt-1 text-center text-sm">
				<span class="text-muted-foreground">Already have an account?</span>
				<Button variant="link" as-child>
					<NuxtLink :to="loginPath">Log in</NuxtLink>
				</Button>
			</div>
		</div>
	</ShellAuth>
</template>
