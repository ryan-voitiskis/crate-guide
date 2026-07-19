<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import * as z from 'zod'
import {
	buildLoginRedirectPath,
	buildResetPasswordPath,
	sanitizeAuthReturnPath
} from '../utils/authRoutes'
import { newPasswordSchema } from '../utils/authValidation'

definePageMeta({ layout: 'auth', keepalive: false })

const user = useUserStore()
const recovery = usePasswordRecovery()
const route = useRoute()
const formElement = ref<HTMLFormElement | null>(null)
const passwordRequirementsId = 'update-password-requirements'
const returnPath = computed(() => sanitizeAuthReturnPath(route.query.redirect))
const loginPath = computed(() => buildLoginRedirectPath(returnPath.value))
const resetPasswordPath = computed(() =>
	buildResetPasswordPath(returnPath.value)
)

useHead({
	title: computed(() =>
		recovery.status.value === 'active'
			? 'Choose new password · Crate Guide'
			: 'Password recovery · Crate Guide'
	)
})
user.clearAuthFeedback?.('password-update')

const schema = z.object({
	password: newPasswordSchema
})

type UpdatePasswordFormValues = z.infer<typeof schema>

const form = useForm({ validationSchema: toTypedSchema(schema) })

watch(
	() => form.values.password,
	() => user.clearAuthFeedback?.('password-update')
)

onBeforeUnmount(() => user.clearAuthFeedback?.('password-update'))

const onSubmit = form.handleSubmit(
	async (values: UpdatePasswordFormValues) => {
		const didReset = await user.resetPassword(values.password, returnPath.value)
		if (didReset) form.resetForm()
	},
	({ errors }) => focusFirstInvalidAuthField(formElement.value, errors)
)
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
				ref="formElement"
				class="flex flex-col gap-3"
				@submit="onSubmit"
			>
				<FormField v-slot="{ componentField }" name="password">
					<FormItem>
						<FormLabel>New password</FormLabel>
						<FormControl>
							<InputPassword
								autocomplete="new-password"
								:described-by="passwordRequirementsId"
								v-bind="componentField"
							/>
						</FormControl>
						<FormMessage />
					</FormItem>
				</FormField>

				<ChecklistAuthPassword
					:id="passwordRequirementsId"
					:password="form.values.password ?? ''"
				/>

				<ButtonLoading
					class="hover:bg-primary mt-2 w-full"
					type="submit"
					:loading="form.isSubmitting.value"
				>
					Update password
				</ButtonLoading>
				<PanelAuthStatus
					v-if="user.authFeedback?.['password-update']"
					tone="error"
					eyebrow="Update failed"
					:title="user.authFeedback['password-update']"
				/>
			</form>

			<div v-else class="grid gap-4">
				<PanelAuthStatus
					tone="error"
					eyebrow="Recovery unavailable"
					title="This password reset link is invalid or has expired."
					description="Request a new link to restart the recovery flow."
				/>

				<Button class="hover:bg-primary w-full" as-child>
					<NuxtLink :to="resetPasswordPath">Request a new link</NuxtLink>
				</Button>
				<Button variant="outline" class="w-full" as-child>
					<NuxtLink :to="loginPath">Back to login</NuxtLink>
				</Button>
			</div>

			<template v-if="recovery.status.value === 'active'">
				<Separator class="my-1" />

				<Button variant="link" as-child>
					<NuxtLink :to="loginPath">Back to login</NuxtLink>
				</Button>
			</template>
		</div>
	</ShellAuth>
</template>
