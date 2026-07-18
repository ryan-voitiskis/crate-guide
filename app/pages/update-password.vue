<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import * as z from 'zod'
import { newPasswordSchema } from '../utils/authValidation'

definePageMeta({ layout: 'auth', keepalive: false })

const user = useUserStore()
const recovery = usePasswordRecovery()

user.clearAuthOperationError?.()

const schema = z.object({
	password: newPasswordSchema
})

type UpdatePasswordFormValues = z.infer<typeof schema>

const form = useForm({ validationSchema: toTypedSchema(schema) })

const onSubmit = form.handleSubmit(async (values: UpdatePasswordFormValues) => {
	const didReset = await user.resetPassword(values.password)
	if (didReset) form.resetForm()
})
</script>

<template>
	<ShellAuth
		chip="B-side · New key"
		title="New password"
		catalog="CG · B02"
		context-title="Secure credential update"
		context-description="A verified, single-use recovery session is required before Crate Guide accepts a new password."
	>
		<div class="grid gap-4">
			<PanelAuthStatus
				v-if="recovery.status.value === 'checking'"
				tone="pending"
				eyebrow="Verifying recovery"
				title="Checking password reset link..."
				description="This normally takes only a moment."
			/>

			<form
				v-else-if="recovery.status.value === 'active'"
				class="flex flex-col gap-3"
				@submit="onSubmit"
			>
				<PanelAuthStatus
					v-if="user.authOperationError"
					tone="error"
					eyebrow="Update failed"
					:title="user.authOperationError"
				/>

				<FormField v-slot="{ componentField }" name="password">
					<FormItem>
						<FormLabel>New password</FormLabel>
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
					:loading="form.isSubmitting.value"
				>
					Update password
				</ButtonLoading>
			</form>

			<div v-else class="grid gap-4">
				<PanelAuthStatus
					tone="error"
					eyebrow="Recovery unavailable"
					title="This password reset link is invalid or has expired."
					description="Request a new link to restart the recovery flow."
				/>

				<Button class="w-full" as-child>
					<NuxtLink to="/reset-password">Request a new link</NuxtLink>
				</Button>
				<Button variant="outline" class="w-full" as-child>
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
