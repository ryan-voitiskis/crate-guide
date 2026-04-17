<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import * as z from 'zod'

const user = useUserStore()

const schema = z.object({
	password: z
		.string()
		.min(8, 'Password must be at least 8 characters')
		.max(64, 'Password cannot exceed 64 characters')
})

type UpdatePasswordFormValues = z.infer<typeof schema>

const form = useForm({ validationSchema: toTypedSchema(schema) })

const onSubmit = form.handleSubmit(async (values: UpdatePasswordFormValues) => {
	await user.resetPassword(values.password)
	form.resetForm()
})
</script>

<template>
	<AuthShell chip="B-side · New key" title="New password" catalog="CG · B02">
		<div class="grid gap-4">
			<form class="flex flex-col gap-3" @submit="onSubmit">
				<FormField v-slot="{ componentField }" name="password">
					<FormItem>
						<FormLabel>New password</FormLabel>
						<FormControl>
							<InputPassword v-bind="componentField" />
						</FormControl>
						<FormMessage />
					</FormItem>
				</FormField>

				<Button
					class="mt-2 w-full"
					type="submit"
					:loading="form.isSubmitting.value"
				>
					Update password
				</Button>
			</form>

			<Separator class="my-1" span-class="bg-card" />

			<Button variant="link" as-child>
				<NuxtLink to="/login">Back to login</NuxtLink>
			</Button>
		</div>
	</AuthShell>
</template>
