import { decodeBrowserRepositoryChange } from './browserLibraryCodecs'
import { browserLibraryRandomUUID } from './browserLibraryRuntime'
import {
	BROWSER_LIBRARY_BROADCAST_CHANNEL_SUFFIX,
	BROWSER_LIBRARY_BROADCAST_PROTOCOL_VERSION,
	type BrowserBroadcastChannel,
	type BrowserLibraryDependencies,
	type BrowserRepositoryChange
} from './browserLibraryTypes'

export function browserLibraryBroadcastChannelName(databaseName: string) {
	return `${databaseName}:${BROWSER_LIBRARY_BROADCAST_CHANNEL_SUFFIX}`
}

function createBroadcastChannel(
	dependencies: BrowserLibraryDependencies,
	databaseName: string
): BrowserBroadcastChannel | null {
	try {
		if (dependencies.createBroadcastChannel) {
			return dependencies.createBroadcastChannel(
				browserLibraryBroadcastChannelName(databaseName)
			)
		}
		if (typeof globalThis.BroadcastChannel === 'undefined') return null
		return new BroadcastChannel(
			browserLibraryBroadcastChannelName(databaseName)
		)
	} catch {
		return null
	}
}

export class BrowserLibraryBroadcaster {
	readonly #senderId: string
	readonly #channel: BrowserBroadcastChannel | null
	readonly #listeners = new Set<(change: BrowserRepositoryChange) => void>()
	readonly #messageListener: EventListener
	#closed = false

	constructor(
		private readonly dependencies: BrowserLibraryDependencies,
		databaseName: string
	) {
		this.#senderId = browserLibraryRandomUUID(dependencies)
		this.#channel = createBroadcastChannel(dependencies, databaseName)
		this.#messageListener = ((event: MessageEvent<unknown>) => {
			try {
				const change = decodeBrowserRepositoryChange(event.data)
				if (change.senderId === this.#senderId) return
				this.#notify(change)
			} catch {
				// Ignore malformed or future-protocol messages from this origin.
			}
		}) as EventListener
		this.#channel?.addEventListener('message', this.#messageListener)
	}

	#notify(change: BrowserRepositoryChange) {
		for (const listener of this.#listeners) {
			try {
				listener(change)
			} catch {
				// Subscriber failures cannot change the result of a durable command.
			}
		}
	}

	publish(
		change: Omit<
			BrowserRepositoryChange,
			'protocolVersion' | 'eventId' | 'senderId'
		>
	) {
		try {
			const message = decodeBrowserRepositoryChange({
				...change,
				protocolVersion: BROWSER_LIBRARY_BROADCAST_PROTOCOL_VERSION,
				eventId: browserLibraryRandomUUID(this.dependencies),
				senderId: this.#senderId
			})
			this.#notify(message)
			this.#channel?.postMessage(message)
		} catch {
			// Transactional CAS remains authoritative when broadcasts are unavailable.
		}
	}

	subscribe(listener: (change: BrowserRepositoryChange) => void): () => void {
		if (this.#closed) return () => undefined
		this.#listeners.add(listener)
		return () => this.#listeners.delete(listener)
	}

	close() {
		if (this.#closed) return
		this.#closed = true
		this.#channel?.removeEventListener('message', this.#messageListener)
		this.#channel?.close()
		this.#listeners.clear()
	}
}
