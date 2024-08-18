<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import * as z from 'zod'

definePageMeta({ layout: 'blank' })

const user = useUserStore()

const signingInWithGithub = ref(false)
const signingInWithGoogle = ref(false)

const formSchema = toTypedSchema(
	z.object({
		email: z.string().trim().email().max(254),
		password: z
			.string()
			.min(8, 'Password must be at least 8 characters')
			.max(64, 'Password cannot exceed 64 characters')
	})
)

const form = useForm({ validationSchema: formSchema })

async function signInWithGithub() {
	signingInWithGithub.value = true
	await user.signInWithProvider('github')
	signingInWithGithub.value = false
}

async function signInWithGoogle() {
	signingInWithGoogle.value = true
	await user.signInWithProvider('google')
	signingInWithGoogle.value = false
}

const onSubmit = form.handleSubmit((values) => {
	user.signUpWithEmail(values.email, values.password)
})
</script>

<template>
	<div class="flex items-center justify-center h-screen">
		<Card class="max-w-md w-full p-6 bg-white rounded-lg shadow-md">
			<CardHeader class="space-y-1">
				<IconCrateGuide class="w-24 mb-2 mx-auto" />
				<CardTitle class="text-2xl">Create account</CardTitle>
				<CardDescription>Continue with a provider below</CardDescription>
			</CardHeader>
			<CardContent class="grid gap-4">
				<div class="grid grid-cols-2 gap-4">
					<Button
						variant="outline"
						:loading="signingInWithGithub"
						:disabled="signingInWithGoogle || form.isSubmitting.value"
						@click="signInWithGithub"
					>
						<IconGithub class="mr-2 w-4" />
						GitHub
					</Button>
					<Button
						variant="outline"
						:loading="signingInWithGoogle"
						:disabled="signingInWithGithub || form.isSubmitting.value"
						@click="signInWithGoogle"
					>
						<IconGoogle class="mr-2 w-4" />
						Google
					</Button>
				</div>

				<Separator label="OR" class="my-2" />

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
								<Input type="password" v-bind="componentField" />
							</FormControl>
							<FormMessage />
						</FormItem>
					</FormField>

					<Button
						class="w-full mt-3"
						type="submit"
						:disabled="signingInWithGithub || signingInWithGoogle"
						:loading="form.isSubmitting.value"
					>
						Create account
					</Button>
				</form>
				<span class="text-center">
					Already have an account?
					<Button variant="link" as-child>
						<NuxtLink to="/login">Login</NuxtLink>
					</Button>
				</span>
			</CardContent>
		</Card>
	</div>
</template>
