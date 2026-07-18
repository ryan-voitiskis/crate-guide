<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import * as z from 'zod'
import { emailSchema } from '../utils/authValidation'

definePageMeta({ layout: 'auth', keepalive: false })

const user = useUserStore()
const linkSent = ref(false)

user.clearAuthOperationError?.()

const schema = z.object({
	email: emailSchema
})

type ResetPasswordFormValues = z.infer<typeof schema>

const form = useForm({ validationSchema: toTypedSchema(schema) })

const onSubmit = form.handleSubmit(async (values: ResetPasswordFormValues) => {
	const didSend = await user.sendPasswordResetEmail(values.email)
	if (didSend) {
		linkSent.value = true
		form.resetForm()
	}
})
</script>

<template>
	<ShellAuth
		chip="B-side · Recovery"
		:title="linkSent ? 'Check your inbox' : 'Reset password'"
		:subtitle="
			linkSent
				? `We've sent you a link to reset your password.`
				: `Enter your email and we'll send you a reset link.`
		"
		catalog="CG · B01"
		context-title="Password recovery"
		context-description="Recovery links are single-use. The reset flow verifies the link before accepting a new credential."
	>
		<div class="grid gap-4">
			<PanelAuthStatus
				v-if="user.authOperationError"
				tone="error"
				eyebrow="Delivery failed"
				:title="user.authOperationError"
			/>

			<form v-if="!linkSent" class="flex flex-col gap-3" @submit="onSubmit">
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

				<ButtonLoading
					class="mt-2 w-full"
					type="submit"
					:loading="form.isSubmitting.value"
				>
					Send reset link
				</ButtonLoading>
			</form>
			<div v-else class="grid gap-3">
				<PanelAuthStatus
					tone="positive"
					eyebrow="Reset link sent"
					title="Check your email to continue."
					description="For your security, the link expires. Check spam or junk folders if it does not arrive within a few minutes."
				/>
				<Button variant="outline" class="w-full" @click="linkSent = false">
					Use another email
				</Button>
			</div>

			<Separator class="my-1" />

			<Button variant="link" as-child>
				<NuxtLink to="/login">Back to login</NuxtLink>
			</Button>
		</div>
	</ShellAuth>
</template>
