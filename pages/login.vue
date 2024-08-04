<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import * as z from 'zod'

definePageMeta({ layout: 'blank' })

const user = useUserStore()

const formSchema = toTypedSchema(
	z.object({
		email: z.string().trim().email().max(254),
		password: z.string().max(64, 'Password cannot exceed 64 characters')
	})
)

const form = useForm({ validationSchema: formSchema })

const onSubmit = form.handleSubmit((values) => {
	user.signInWithEmail(values.email, values.password)
})
</script>

<template>
	<div class="flex items-center justify-center h-screen">
		<Card class="max-w-md w-full p-6 bg-white rounded-lg shadow-md">
			<CardHeader class="space-y-1">
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
						:loading="user.signingInWithGithub"
						:disabled="user.signingInWithGoogle || user.signingInWithEmail"
						@click="user.signInWithProvider('github')"
					>
						<IconGithub class="mr-2 w-4" />
						GitHub
					</Button>
					<Button
						variant="outline"
						:loading="user.signingInWithGoogle"
						:disabled="user.signingInWithGithub || user.signingInWithEmail"
						@click="user.signInWithProvider('google')"
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
						:disabled="user.signingInWithGithub || user.signingInWithGoogle"
						:loading="user.signingInWithEmail"
					>
						Sign in
					</Button>
				</form>
				<span class="text-center">
					Don't have an account?
					<Button variant="link" as-child>
						<NuxtLink to="/signup">Sign up</NuxtLink>
					</Button>
				</span>
			</CardContent>
		</Card>
	</div>
</template>
