<script setup lang="ts">
import {
	ExternalLink,
	Gauge,
	Info,
	Palette,
	Radio,
	UserRound
} from 'lucide-vue-next'

const user = useSupabaseUser()
</script>

<template>
	<div class="scrollbar-hidden h-full min-h-0 overflow-y-auto border-t">
		<div
			class="mx-auto grid w-full max-w-5xl gap-6 p-4 md:p-6 lg:grid-cols-[200px_minmax(0,1fr)]"
		>
			<aside class="space-y-4">
				<div>
					<p class="text-xs font-semibold tracking-[0.1em] uppercase">
						Demo preferences
					</p>
					<p class="text-muted-foreground mt-1 text-xs leading-relaxed">
						Explore interface options without creating an account.
					</p>
				</div>
				<nav class="divide-y border-y text-xs">
					<a
						href="#appearance"
						class="flex items-center gap-2 py-2.5 font-medium"
					>
						<Palette class="text-primary size-3.5" />
						Appearance
					</a>
					<a
						href="#session"
						class="text-muted-foreground flex items-center gap-2 py-2.5"
					>
						<Gauge class="size-3.5" />
						Session
					</a>
					<a
						href="#account"
						class="text-muted-foreground flex items-center gap-2 py-2.5"
					>
						<UserRound class="size-3.5" />
						Account
					</a>
				</nav>
				<div
					class="bg-muted/40 text-muted-foreground flex items-start gap-2 rounded-md border p-3 text-[11px] leading-relaxed"
				>
					<Info class="mt-0.5 size-3.5 shrink-0" />
					<span>
						Changes are local to this browser and are not attached to a library.
					</span>
				</div>
			</aside>

			<main class="min-w-0 space-y-4">
				<header class="mb-6">
					<div class="flex items-center gap-2">
						<h1 class="text-xl font-semibold">Interface settings</h1>
						<Badge variant="secondary" class="font-mono text-[9px]">
							PREVIEW
						</Badge>
					</div>
					<p class="text-muted-foreground mt-1 text-sm">
						Tune the workbench to match your notation and hardware preferences.
					</p>
				</header>

				<Card id="appearance" class="gap-0 py-0">
					<CardHeader class="border-b py-4">
						<div class="flex items-start gap-3">
							<div
								class="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-md"
							>
								<Palette class="size-4" />
							</div>
							<div>
								<CardTitle class="text-sm">Appearance and notation</CardTitle>
								<CardDescription class="mt-0.5 text-xs">
									Choose the surface theme and the musical notation shown in
									dense views.
								</CardDescription>
							</div>
						</div>
					</CardHeader>
					<CardContent class="space-y-5 py-5">
						<SelectorTheme local-only />
						<Separator />
						<SelectorKeyFormat local-only />
						<Separator />
						<SelectorTurntableColor local-only />
					</CardContent>
				</Card>

				<Card id="session" class="gap-0 py-0">
					<CardHeader class="border-b py-4">
						<div class="flex items-start gap-3">
							<div
								class="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-md"
							>
								<Radio class="size-4" />
							</div>
							<div>
								<CardTitle class="text-sm">Session behavior</CardTitle>
								<CardDescription class="mt-0.5 text-xs">
									Set the amount of pitch travel available while planning
									transitions.
								</CardDescription>
							</div>
						</div>
					</CardHeader>
					<CardContent class="py-5">
						<SelectPitchRange local-only />
					</CardContent>
				</Card>

				<Card id="account" class="gap-0 py-0">
					<CardContent
						class="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between"
					>
						<div class="flex items-start gap-3">
							<div
								class="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md"
							>
								<UserRound class="size-4" />
							</div>
							<div>
								<p class="text-sm font-semibold">
									{{
										user ? 'Continue to your library' : 'Keep your preferences'
									}}
								</p>
								<p class="text-muted-foreground mt-0.5 text-xs">
									{{
										user
											? 'Return to the authenticated workbench.'
											: 'Create an account to save settings with your collection.'
									}}
								</p>
							</div>
						</div>
						<Button as-child size="sm" class="shrink-0">
							<NuxtLink :to="user ? '/' : '/signup?redirect=%2Fsettings'">
								{{ user ? 'Go to app' : 'Create account' }}
								<ExternalLink class="ml-2 size-3.5" />
							</NuxtLink>
						</Button>
					</CardContent>
				</Card>
			</main>
		</div>
	</div>
</template>
