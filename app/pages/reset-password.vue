<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import * as z from 'zod'

definePageMeta({ keepalive: false })

const user = useUserStore()
const linkSent = ref(false)

const schema = z.object({
	email: z.string().trim().email().max(254)
})

type ResetPasswordFormValues = z.infer<typeof schema>

const form = useForm({ validationSchema: toTypedSchema(schema) })

const onSubmit = form.handleSubmit(async (values: ResetPasswordFormValues) => {
	linkSent.value = await user.sendPasswordResetEmail(values.email)
	form.resetForm()
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
	>
		<div class="grid gap-4">
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

				<ButtonLoading
					class="mt-2 w-full"
					type="submit"
					:loading="form.isSubmitting.value"
				>
					Send reset link
				</ButtonLoading>
			</form>
			<div v-else class="py-2">
				<AnimationTick class="mx-auto" />
			</div>

			<Separator class="my-1" />

			<Button variant="link" as-child>
				<NuxtLink to="/login">Back to login</NuxtLink>
			</Button>
		</div>
	</ShellAuth>
</template>
