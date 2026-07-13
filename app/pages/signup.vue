<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import * as z from 'zod'
import { emailSchema, newPasswordSchema } from '../utils/authValidation'

definePageMeta({ keepalive: false })

const user = useUserStore()

const signingInWithGithub = ref(false)
const signingInWithGoogle = ref(false)

const schema = z.object({
	email: emailSchema,
	password: newPasswordSchema
})

type SignupFormValues = z.infer<typeof schema>

const form = useForm({ validationSchema: toTypedSchema(schema) })

const onSubmit = form.handleSubmit(async (values: SignupFormValues) => {
	const didSignUp = await user.signUpWithEmail(values.email, values.password)
	if (didSignUp) form.resetForm()
})

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
</script>

<template>
	<ShellAuth
		chip="Cut 02 · New record"
		title="Create your account"
		catalog="CG · A02"
	>
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

				<ButtonLoading
					class="mt-2 w-full"
					type="submit"
					:disabled="signingInWithGithub || signingInWithGoogle"
					:loading="form.isSubmitting.value"
				>
					Create account
				</ButtonLoading>
			</form>

			<div class="pt-1 text-center text-sm">
				<span class="text-muted-foreground">Already have an account?</span>
				<Button variant="link" as-child>
					<NuxtLink to="/login">Log in</NuxtLink>
				</Button>
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
