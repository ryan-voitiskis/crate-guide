<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import * as z from 'zod'

const user = useUserStore()
const recovery = usePasswordRecovery()

const schema = z.object({
	password: z
		.string()
		.min(8, 'Password must be at least 8 characters')
		.max(64, 'Password cannot exceed 64 characters')
})

type UpdatePasswordFormValues = z.infer<typeof schema>

const form = useForm({ validationSchema: toTypedSchema(schema) })

const onSubmit = form.handleSubmit(async (values: UpdatePasswordFormValues) => {
	const didReset = await user.resetPassword(values.password)
	if (didReset) form.resetForm()
})
</script>

<template>
	<ShellAuth chip="B-side · New key" title="New password" catalog="CG · B02">
		<div class="grid gap-4">
			<StateLoading
				v-if="recovery.status.value === 'checking'"
				message="Checking password reset link..."
			/>

			<form
				v-else-if="recovery.status.value === 'active'"
				class="flex flex-col gap-3"
				@submit="onSubmit"
			>
				<FormField v-slot="{ componentField }" name="password">
					<FormItem>
						<FormLabel>New password</FormLabel>
						<FormControl>
							<InputPassword v-bind="componentField" />
						</FormControl>
						<FormMessage />
					</FormItem>
				</FormField>

				<ButtonLoading
					class="mt-2 w-full"
					type="submit"
					:loading="form.isSubmitting.value"
				>
					Update password
				</ButtonLoading>
			</form>

			<div v-else class="grid gap-4">
				<NoticeError class="items-start">
					<div class="space-y-1">
						<p class="font-medium">
							This password reset link is invalid or has expired.
						</p>
						<p>Return to login and request a new link.</p>
					</div>
				</NoticeError>

				<Button class="w-full" as-child>
					<NuxtLink to="/login">Back to login</NuxtLink>
				</Button>
			</div>

			<template v-if="recovery.status.value === 'active'">
				<Separator class="my-1" />

				<Button variant="link" as-child>
					<NuxtLink to="/login">Back to login</NuxtLink>
				</Button>
			</template>
		</div>
	</ShellAuth>
</template>
