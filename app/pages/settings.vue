<script setup lang="ts">
import {
	Disc3,
	Info,
	Palette,
	Plug,
	ShieldAlert,
	SlidersHorizontal,
	UserRound
} from 'lucide-vue-next'

const user = useWorkbenchUserStore()
const capabilities = useWorkbenchCapabilities()
const route = useRoute()
const isDemo = capabilities.mode === 'demo'
const openDeleteAccountOnReturn = computed(
	() => route.query.action === 'delete-account'
)

const settingsSections = computed(() => [
	{ id: 'integration', label: 'Integration', icon: Plug },
	{ id: 'appearance', label: 'Appearance', icon: Palette },
	{ id: 'deck', label: 'Deck controls', icon: SlidersHorizontal },
	...(user.supaUser || isDemo
		? [{ id: 'account', label: 'Account', icon: UserRound }]
		: []),
	{ id: 'about', label: 'About & legal', icon: Info },
	...(user.supaUser || isDemo
		? [{ id: 'danger', label: 'Data controls', icon: ShieldAlert }]
		: [])
])
</script>

<template>
	<div
		data-settings-scroll-container
		class="scrollbar-hidden h-full min-h-0 overflow-y-auto overscroll-contain"
	>
		<div class="mx-auto w-full max-w-6xl px-3 py-4 sm:px-5 sm:py-6">
			<header class="mb-5 flex items-end justify-between gap-4">
				<div>
					<div
						class="text-muted-foreground mb-1 font-mono text-[10px] tracking-[0.18em] uppercase"
					>
						System / Preferences
					</div>
					<h1 class="text-2xl font-semibold tracking-tight">Settings</h1>
					<p class="text-muted-foreground mt-1 max-w-xl text-sm">
						Tune your library, notation and playback workspace.
					</p>
				</div>
				<div
					class="border-border bg-muted/30 hidden items-center gap-2 rounded-sm border px-2.5 py-1.5 font-mono text-[10px] tracking-wide uppercase lg:flex"
				>
					<span class="size-1.5 rounded-full bg-emerald-500" />
					Preferences local
				</div>
			</header>

			<div class="grid items-start gap-5 lg:grid-cols-[180px_minmax(0,1fr)]">
				<nav
					class="border-border bg-card/60 sticky top-3 hidden overflow-hidden rounded-sm border lg:block"
					aria-label="Settings sections"
				>
					<div
						class="border-border text-muted-foreground border-b px-3 py-2 font-mono text-[10px] tracking-[0.16em] uppercase"
					>
						Sections
					</div>
					<a
						v-for="section in settingsSections"
						:key="section.id"
						:href="`#${section.id}`"
						class="border-border/70 hover:bg-muted/60 flex items-center gap-2 border-b px-3 py-2.5 text-xs transition-colors last:border-b-0"
					>
						<component
							:is="section.icon"
							class="text-muted-foreground size-3.5"
						/>
						{{ section.label }}
					</a>
				</nav>

				<div
					class="border-border bg-card/65 divide-border divide-y overflow-hidden rounded-sm border shadow-xs"
				>
					<section id="integration" class="scroll-mt-3 p-4 sm:p-5">
						<div
							class="grid gap-4 md:grid-cols-[minmax(0,0.8fr)_minmax(260px,1.2fr)]"
						>
							<div>
								<div class="flex items-center gap-2">
									<Plug class="text-primary size-4" />
									<h2 class="text-sm font-semibold">Discogs integration</h2>
								</div>
								<p class="text-muted-foreground mt-1 text-xs leading-relaxed">
									Connect your account to import and keep collection metadata in
									sync.
								</p>
							</div>
							<DetailsDiscogsAuth
								:show-heading="false"
								:read-only="!capabilities.canConnectDiscogs"
							/>
						</div>
					</section>

					<section id="appearance" class="scroll-mt-3 p-4 sm:p-5">
						<div class="mb-5 flex items-center gap-2">
							<Palette class="text-primary size-4" />
							<div>
								<h2 class="text-sm font-semibold">Appearance &amp; notation</h2>
								<p class="text-muted-foreground text-xs">
									Choose the visual environment and how musical data is shown.
								</p>
							</div>
						</div>
						<div class="space-y-5">
							<SelectorTheme :local-only="isDemo" />
							<Separator />
							<SelectorKeyFormat :local-only="isDemo" />
							<Separator />
							<SelectorTurntableColor :local-only="isDemo" />
						</div>
					</section>

					<section id="deck" class="scroll-mt-3 p-4 sm:p-5">
						<div
							class="grid gap-4 md:grid-cols-[minmax(0,0.8fr)_minmax(260px,1.2fr)] md:items-center"
						>
							<div>
								<div class="flex items-center gap-2">
									<Disc3 class="text-primary size-4" />
									<h2 class="text-sm font-semibold">Deck controls</h2>
								</div>
								<p class="text-muted-foreground mt-1 text-xs leading-relaxed">
									Set the control range used by the turntable simulation.
								</p>
							</div>
							<SelectPitchRange :local-only="isDemo" />
						</div>
					</section>

					<section
						v-if="user.supaUser || isDemo"
						id="account"
						class="scroll-mt-3 p-4 sm:p-5"
					>
						<h2 class="mb-3 text-sm font-semibold">Account</h2>
						<div
							class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
						>
							<div class="flex min-w-0 items-center gap-3">
								<div
									class="bg-muted flex size-9 shrink-0 items-center justify-center rounded-sm border"
								>
									<UserRound class="size-4" />
								</div>
								<div class="min-w-0">
									<p class="truncate text-sm font-medium">
										{{
											isDemo
												? 'Demo visitor'
												: user.supaUser?.user_metadata?.full_name ||
													'Signed in user'
										}}
									</p>
									<p class="text-muted-foreground truncate font-mono text-xs">
										{{
											isDemo
												? 'Account controls unavailable'
												: user.supaUser?.email
										}}
									</p>
								</div>
							</div>
							<Button
								variant="outline"
								size="sm"
								:disabled="!capabilities.canManageAccount"
								@click="user.signOut"
							>
								Log out
							</Button>
						</div>
					</section>

					<section id="about" class="scroll-mt-3 p-4 sm:p-5">
						<div
							class="grid gap-4 md:grid-cols-[minmax(0,0.8fr)_minmax(260px,1.2fr)] md:items-center"
						>
							<div>
								<div class="flex items-center gap-2">
									<Info class="text-primary size-4" />
									<h2 class="text-sm font-semibold">About Crate Guide</h2>
								</div>
								<p class="text-muted-foreground mt-1 text-xs leading-relaxed">
									A non-commercial, open-source proof of concept available under
									the AGPL-3.0 licence.
								</p>
							</div>
							<LinksLegal class="md:justify-end" />
						</div>
					</section>

					<section
						v-if="user.supaUser || isDemo"
						id="danger"
						class="scroll-mt-3 space-y-3 p-4 sm:p-5"
					>
						<div
							class="border-destructive/25 bg-destructive/5 flex flex-col gap-4 rounded-sm border p-3 sm:flex-row sm:items-center sm:justify-between"
						>
							<div class="flex items-start gap-3">
								<ShieldAlert class="text-destructive mt-0.5 size-4 shrink-0" />
								<div>
									<p class="text-destructive text-sm font-medium">
										Clear all library data
									</p>
									<p
										class="text-muted-foreground mt-0.5 max-w-xl text-xs leading-relaxed"
									>
										Permanently delete every record and track. This cannot be
										undone.
									</p>
								</div>
							</div>
							<Button v-if="isDemo" variant="destructive" disabled>
								Clear library
							</Button>
							<DialogClearAllData v-else />
						</div>
						<div
							class="border-destructive/25 bg-destructive/5 flex flex-col gap-4 rounded-sm border p-3 sm:flex-row sm:items-center sm:justify-between"
						>
							<div class="flex items-start gap-3">
								<ShieldAlert class="text-destructive mt-0.5 size-4 shrink-0" />
								<div>
									<p class="text-destructive text-sm font-medium">
										Delete account
									</p>
									<p
										class="text-muted-foreground mt-0.5 max-w-xl text-xs leading-relaxed"
									>
										Permanently delete your account, library, integrations and
										uploaded covers.
									</p>
								</div>
							</div>
							<Button v-if="isDemo" variant="destructive" disabled>
								Delete account
							</Button>
							<DialogDeleteAccount
								v-else
								:open-on-mount="openDeleteAccountOnReturn"
							/>
						</div>
					</section>
				</div>
			</div>
		</div>
	</div>
</template>
