<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import * as z from 'zod'

definePageMeta({ layout: 'blank' })

const user = useUserStore()

const formSchema = toTypedSchema(
	z.object({
		password: z
			.string()
			.min(8, 'Password must be at least 8 characters')
			.max(64, 'Password cannot exceed 64 characters')
	})
)

const form = useForm({ validationSchema: formSchema })

const onSubmit = form.handleSubmit(async (values) => {
	await user.resetPassword(values.password)
	form.resetForm()
})
</script>

<template>
	<div class="flex items-center justify-center h-screen">
		<Card class="max-w-md w-full p-6 bg-white rounded-lg shadow-md">
			<CardHeader class="space-y-1">
				<IconCrateGuide class="w-24 mb-2 mx-auto" />
				<CardTitle class="text-2xl">Update your password</CardTitle>
				<CardDescription>Enter your new password</CardDescription>
			</CardHeader>
			<CardContent class="grid gap-4">
				<form class="flex flex-col gap-3" @submit="onSubmit">
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
						:loading="form.isSubmitting.value"
					>
						Update password
					</Button>
				</form>
				<span class="text-center">
					<Button variant="link" as-child>
						<NuxtLink to="/login">Back to login</NuxtLink>
					</Button>
				</span>
			</CardContent>
		</Card>
	</div>
</template>
