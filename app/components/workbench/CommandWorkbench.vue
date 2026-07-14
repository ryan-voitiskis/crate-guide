<script setup lang="ts">
import { Command as CommandIcon, Search } from 'lucide-vue-next'

const router = useRouter()
const { getHref, visibleNavItems } = useNavigation()

const open = ref(false)
const query = ref('')
const activeIndex = ref(0)
const input = ref<HTMLInputElement | null>(null)

const filteredItems = computed(() => {
	const normalizedQuery = query.value.trim().toLocaleLowerCase()
	if (!normalizedQuery) return visibleNavItems.value

	return visibleNavItems.value.filter((item) =>
		`${item.label} ${item.description}`
			.toLocaleLowerCase()
			.includes(normalizedQuery)
	)
})

function isEditableTarget(target: EventTarget | null) {
	if (!(target instanceof HTMLElement)) return false
	return (
		target.isContentEditable ||
		['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
	)
}

function showCommand() {
	open.value = true
}

function closeCommand() {
	open.value = false
}

async function navigate(path: string) {
	closeCommand()
	await router.push(getHref(path))
}

function handleKeydown(event: KeyboardEvent) {
	if (
		(event.metaKey || event.ctrlKey) &&
		event.key.toLocaleLowerCase() === 'k'
	) {
		event.preventDefault()
		if (open.value) closeCommand()
		else showCommand()
		return
	}

	if (!open.value && event.key === '/' && !isEditableTarget(event.target)) {
		event.preventDefault()
		showCommand()
		return
	}

	if (!open.value) return

	if (event.key === 'Escape') {
		event.preventDefault()
		closeCommand()
		return
	}

	if (event.key === 'ArrowDown') {
		event.preventDefault()
		if (filteredItems.value.length > 0) {
			activeIndex.value = (activeIndex.value + 1) % filteredItems.value.length
		}
		return
	}

	if (event.key === 'ArrowUp') {
		event.preventDefault()
		if (filteredItems.value.length > 0) {
			activeIndex.value =
				(activeIndex.value - 1 + filteredItems.value.length) %
				filteredItems.value.length
		}
		return
	}

	if (event.key === 'Enter') {
		const item = filteredItems.value[activeIndex.value]
		if (item) {
			event.preventDefault()
			void navigate(item.path)
		}
	}
}

watch(query, () => {
	activeIndex.value = 0
})

watch(open, async (isOpen) => {
	if (!isOpen) {
		query.value = ''
		activeIndex.value = 0
		return
	}
	await nextTick()
	input.value?.focus()
})

onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
	<button
		type="button"
		class="focus-visible:ring-signal flex h-8 shrink-0 items-center gap-2 rounded-sm border border-white/10 px-2 text-white/55 transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:outline-none"
		aria-label="Open command palette"
		@click="showCommand"
	>
		<CommandIcon class="size-3.5" />
		<span class="hidden text-[0.68rem] lg:inline xl:hidden 2xl:inline">
			Quick switch
		</span>
		<kbd
			class="hidden rounded-[3px] border border-white/10 bg-black/15 px-1.5 py-0.5 font-mono text-[0.55rem] text-white/40 sm:inline"
		>
			⌘ K
		</kbd>
	</button>

	<Dialog v-model:open="open">
		<DialogContent
			class="border-border/80 bg-popover gap-0 overflow-hidden p-0 shadow-2xl sm:max-w-xl"
			hide-close
		>
			<DialogHeader class="sr-only">
				<DialogTitle>Quick switch</DialogTitle>
				<DialogDescription>
					Search Crate Guide destinations and press Enter to navigate.
				</DialogDescription>
			</DialogHeader>

			<div class="border-border flex h-12 items-center gap-3 border-b px-3">
				<Search class="text-muted-foreground size-4 shrink-0" />
				<input
					ref="input"
					v-model="query"
					type="search"
					class="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
					placeholder="Search workspace…"
					aria-label="Search workspace destinations"
				/>
				<kbd
					class="text-muted-foreground border-border rounded-sm border px-1.5 py-0.5 font-mono text-[0.55rem]"
				>
					ESC
				</kbd>
			</div>

			<div class="max-h-[min(22rem,60vh)] overflow-y-auto p-1.5">
				<p
					v-if="filteredItems.length === 0"
					class="text-muted-foreground px-3 py-8 text-center text-sm"
				>
					No workspace destinations found.
				</p>
				<button
					v-for="(item, index) in filteredItems"
					:key="item.path"
					type="button"
					class="flex w-full items-center gap-3 rounded-sm px-2.5 py-2 text-left transition-colors"
					:class="
						index === activeIndex
							? 'bg-accent text-accent-foreground'
							: 'text-foreground'
					"
					@mouseenter="activeIndex = index"
					@click="navigate(item.path)"
				>
					<span
						class="border-border bg-background flex size-8 shrink-0 items-center justify-center rounded-sm border"
					>
						<component :is="item.icon" class="size-3.5" />
					</span>
					<span class="min-w-0 flex-1">
						<span class="block truncate text-sm font-medium">
							{{ item.label }}
						</span>
						<span class="text-muted-foreground block truncate text-xs">
							{{ item.description }}
						</span>
					</span>
					<kbd
						class="text-muted-foreground hidden font-mono text-[0.58rem] tracking-wider sm:inline"
					>
						{{ item.shortcut }}
					</kbd>
				</button>
			</div>

			<div
				class="border-border text-muted-foreground flex items-center gap-3 border-t px-3 py-2 font-mono text-[0.55rem] tracking-wide uppercase"
			>
				<span>
					<kbd>↑↓</kbd>
					Select
				</span>
				<span>
					<kbd>↵</kbd>
					Open
				</span>
				<span class="ml-auto">/ from anywhere</span>
			</div>
		</DialogContent>
	</Dialog>
</template>
