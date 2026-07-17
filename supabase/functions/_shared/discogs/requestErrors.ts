export class DiscogsConnectionRequiredError extends Error {
	constructor() {
		super('Discogs connection required')
		this.name = 'DiscogsConnectionRequiredError'
	}
}

export class DiscogsUpstreamTimeoutError extends Error {
	constructor() {
		super('Discogs upstream request timed out')
		this.name = 'DiscogsUpstreamTimeoutError'
	}
}

export class DiscogsUpstreamTransportError extends Error {
	constructor() {
		super('Discogs upstream transport failed')
		this.name = 'DiscogsUpstreamTransportError'
	}
}
