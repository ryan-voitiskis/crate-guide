<script setup lang="ts">
import { Mail } from 'lucide-vue-next'
</script>

<template>
	<div class="flex h-screen items-center justify-center">
		<Card class="w-full max-w-md rounded-lg p-6 shadow-md">
			<CardHeader class="space-y-1">
				<Button variant="blank" size="xl-icon" class="mx-auto mb-2" as-child>
					<NuxtLink to="/demo">
						<LogoCrateGuide />
					</NuxtLink>
				</Button>
				<CardTitle class="text-2xl">Check your inbox</CardTitle>
				<CardDescription>
					We sent you a confirmation email to finish creating your account.
				</CardDescription>
			</CardHeader>
			<CardContent class="grid gap-4">
				<div
					class="border-border bg-muted/30 flex items-start gap-3 rounded-md border p-4 text-sm"
				>
					<Mail class="mt-0.5 size-5 shrink-0" />
					<div class="space-y-1">
						<p>Open the email and click the confirmation link.</p>
						<p class="text-muted-foreground">
							If it doesn't arrive within a few minutes, check your spam folder.
						</p>
					</div>
				</div>

				<Separator class="my-2" span-class="bg-card" />

				<span class="text-center">
					Already confirmed?
					<Button variant="link" as-child>
						<NuxtLink to="/login">Log in</NuxtLink>
					</Button>
				</span>
			</CardContent>
		</Card>
	</div>
</template>
