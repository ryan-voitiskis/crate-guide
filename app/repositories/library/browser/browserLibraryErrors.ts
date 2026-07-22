import type {
	BrowserStorageHealth,
	BrowserStorageHealthCode
} from './browserLibraryTypes'

export type BrowserStorageFailureCode = Exclude<
	BrowserStorageHealthCode,
	'healthy'
>

export class BrowserStorageError extends Error {
	constructor(
		public readonly code: BrowserStorageFailureCode,
		message: string,
		options?: ErrorOptions
	) {
		super(message, options)
		this.name = 'BrowserStorageError'
	}
}

export class BrowserStorageCodecError extends BrowserStorageError {
	constructor(
		public readonly path: string,
		message = 'Stored Local library data failed strict validation.',
		options?: ErrorOptions
	) {
		super('corrupt', message, options)
		this.name = 'BrowserStorageCodecError'
	}
}

function errorName(error: unknown): string | null {
	return error && typeof error === 'object' && 'name' in error
		? String(error.name)
		: null
}

export function classifyBrowserStorageError(
	error: unknown,
	fallbackMessage = 'The Local library storage operation failed.'
): BrowserStorageError {
	if (error instanceof BrowserStorageError) return error

	const options = { cause: error }
	switch (errorName(error)) {
		case 'QuotaExceededError':
			return new BrowserStorageError(
				'quota',
				'This browser could not reserve enough storage for the Local library.',
				options
			)
		case 'SecurityError':
		case 'NotAllowedError':
			return new BrowserStorageError(
				'unavailable',
				'This browser does not allow Local library storage in the current context.',
				options
			)
		case 'VersionError':
			return new BrowserStorageError(
				'corrupt',
				'This Local library was written by an unsupported newer app version.',
				options
			)
		case 'ConstraintError':
		case 'DataError':
			return new BrowserStorageError(
				'corrupt',
				'The Local library contains data that violates its storage contract.',
				options
			)
		case 'InvalidStateError':
		case 'ReadOnlyError':
			return new BrowserStorageError(
				'unavailable',
				'The Local library storage connection is no longer writable.',
				options
			)
		default:
			return new BrowserStorageError('unknown', fallbackMessage, options)
	}
}

export function storageHealthFromError(
	error: unknown,
	checkedAt: string
): BrowserStorageHealth {
	const classified = classifyBrowserStorageError(error)
	return {
		code: classified.code,
		message: classified.message,
		checkedAt
	}
}
