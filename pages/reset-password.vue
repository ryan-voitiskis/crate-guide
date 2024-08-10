<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import * as z from 'zod'

definePageMeta({ layout: 'blank', keepalive: false })

const user = useUserStore()
const linkSent = ref(false)

const formSchema = toTypedSchema(
	z.object({
		email: z.string().trim().email().max(254)
	})
)

const form = useForm({ validationSchema: formSchema })

const onSubmit = form.handleSubmit(async (values) => {
	linkSent.value = await user.sendPasswordResetEmail(values.email)
	form.resetForm()
})
</script>

<template>
	<div class="flex items-center justify-center h-screen">
		<Card class="max-w-md w-full p-6 bg-white rounded-lg shadow-md">
			<CardHeader class="space-y-1">
				<CardTitle class="text-2xl">
					{{ linkSent ? 'Reset link sent!' : 'Reset password' }}
				</CardTitle>
				<CardDescription>
					{{
						linkSent
							? `Check your inbox for the link you've just been sent`
							: `Enter your email to receive a link to reset your password`
					}}
				</CardDescription>
			</CardHeader>
			<CardContent class="grid gap-4">
				<form v-if="!linkSent" class="flex flex-col gap-3" @submit="onSubmit">
					<FormField v-slot="{ componentField }" name="email">
						<FormItem>
							<FormLabel>Email</FormLabel>
							<FormControl>
								<Input placeholder="user@domain.com" v-bind="componentField" />
							</FormControl>
							<FormMessage />
						</FormItem>
					</FormField>

					<Button
						class="w-full mt-3"
						type="submit"
						:loading="user.sendingPasswordResetEmail"
					>
						Send reset link
					</Button>
				</form>
				<div v-else>
					<p class="text-center"></p>
					<AnimatedTick class="mx-auto mt-4" />
				</div>
				<Button variant="link" as-child>
					<NuxtLink to="/login">Back to login</NuxtLink>
				</Button>
			</CardContent>
		</Card>
	</div>
</template>
