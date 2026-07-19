<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import * as z from 'zod'
import {
	buildLoginRedirectPath,
	sanitizeAuthReturnPath
} from '../utils/authRoutes'
import { emailSchema } from '../utils/authValidation'

definePageMeta({ layout: 'auth', keepalive: false })

const user = useUserStore()
const route = useRoute()
const linkSent = ref(false)
const formElement = ref<HTMLFormElement | null>(null)
const returnPath = computed(() => sanitizeAuthReturnPath(route.query.redirect))
const loginPath = computed(() => buildLoginRedirectPath(returnPath.value))

useHead({
	title: computed(() =>
		linkSent.value
			? 'Reset link sent · Crate Guide'
			: 'Reset password · Crate Guide'
	)
})
user.clearAuthFeedback?.('password-reset-request')

const schema = z.object({
	email: emailSchema
})

type ResetPasswordFormValues = z.infer<typeof schema>

const form = useForm({ validationSchema: toTypedSchema(schema) })

watch(
	() => form.values.email,
	() => user.clearAuthFeedback?.('password-reset-request')
)

onBeforeUnmount(() => user.clearAuthFeedback?.('password-reset-request'))

const onSubmit = form.handleSubmit(
	async (values: ResetPasswordFormValues) => {
		const didSend = await user.sendPasswordResetEmail(
			values.email,
			returnPath.value
		)
		if (didSend) {
			linkSent.value = true
			form.resetForm()
		}
	},
	({ errors }) => focusFirstInvalidAuthField(formElement.value, errors)
)
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
			<form
				v-if="!linkSent"
				ref="formElement"
				class="flex flex-col gap-3"
				@submit="onSubmit"
			>
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
					class="hover:bg-primary mt-2 w-full"
					type="submit"
					:loading="form.isSubmitting.value"
				>
					Send reset link
				</ButtonLoading>
				<PanelAuthStatus
					v-if="user.authFeedback?.['password-reset-request']"
					tone="error"
					eyebrow="Delivery failed"
					:title="user.authFeedback['password-reset-request']"
				/>
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
				<NuxtLink :to="loginPath">Back to login</NuxtLink>
			</Button>
		</div>
	</ShellAuth>
</template>
