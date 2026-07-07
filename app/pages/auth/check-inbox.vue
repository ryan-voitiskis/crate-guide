<script setup lang="ts">
import { Mail } from 'lucide-vue-next'
</script>

<template>
	<ShellAuth
		chip="Intermission · Awaiting cue"
		title="Check your inbox"
		subtitle="Click the confirmation link we just sent to finish creating your account."
		catalog="CG · A02b"
	>
		<div class="grid gap-4">
			<div
				class="border-border/70 bg-muted/30 text-muted-foreground flex items-center gap-3 rounded-md border p-4 text-sm"
			>
				<Mail class="text-primary size-5 shrink-0" />
				<p>
					If it doesn't arrive within a few minutes, check your spam folder.
				</p>
			</div>

			<Separator class="my-1" span-class="bg-card" />

			<div class="text-center text-sm">
				<span class="text-muted-foreground">Already confirmed?</span>
				<Button variant="link" as-child>
					<NuxtLink to="/login">Log in</NuxtLink>
				</Button>
			</div>
		</div>
	</ShellAuth>
</template>
