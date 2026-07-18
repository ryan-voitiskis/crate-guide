export const RECORD_COVER_BUCKET = 'record-covers'
export const RECORD_COVER_SOURCE_MAX_BYTES = 10 * 1024 * 1024
export const RECORD_COVER_STORED_MAX_BYTES = 2 * 1024 * 1024
export const RECORD_COVER_MIN_EDGE = 300
export const RECORD_COVER_MAX_PIXELS = 20_000_000
export const RECORD_COVER_OUTPUT_SIZE = 1200

export const RECORD_COVER_ALLOWED_TYPES = [
	'image/jpeg',
	'image/png',
	'image/webp'
] as const

export type RecordCoverCrop = {
	positionX: number
	positionY: number
}

export type SquareCrop = {
	sourceX: number
	sourceY: number
	sourceSize: number
}

type DecodedImage = {
	source: CanvasImageSource
	width: number
	height: number
	cleanup: () => void
}

function clampPercentage(value: number): number {
	return Math.min(100, Math.max(0, value))
}

export function validateRecordCoverFile(
	file: Pick<File, 'size' | 'type'>
): string | null {
	if (
		!RECORD_COVER_ALLOWED_TYPES.includes(
			file.type as (typeof RECORD_COVER_ALLOWED_TYPES)[number]
		)
	) {
		return 'Choose a JPG, PNG or WebP image.'
	}

	if (file.size > RECORD_COVER_SOURCE_MAX_BYTES) {
		return 'Cover images must be 10 MB or smaller.'
	}

	return null
}

export function validateRecordCoverDimensions(
	width: number,
	height: number
): string | null {
	if (
		!Number.isFinite(width) ||
		!Number.isFinite(height) ||
		width <= 0 ||
		height <= 0
	) {
		return 'The image dimensions could not be read.'
	}

	if (width < RECORD_COVER_MIN_EDGE || height < RECORD_COVER_MIN_EDGE) {
		return `Cover images must be at least ${RECORD_COVER_MIN_EDGE} × ${RECORD_COVER_MIN_EDGE} pixels.`
	}

	if (width * height > RECORD_COVER_MAX_PIXELS) {
		return 'Cover images must be 20 megapixels or smaller.'
	}

	return null
}

export function calculateSquareCrop(
	width: number,
	height: number,
	crop: RecordCoverCrop
): SquareCrop {
	const sourceSize = Math.min(width, height)
	const horizontalTravel = Math.max(0, width - sourceSize)
	const verticalTravel = Math.max(0, height - sourceSize)

	return {
		sourceX: horizontalTravel * (clampPercentage(crop.positionX) / 100),
		sourceY: verticalTravel * (clampPercentage(crop.positionY) / 100),
		sourceSize
	}
}

async function decodeRecordCover(file: File): Promise<DecodedImage> {
	if (typeof createImageBitmap === 'function') {
		const bitmap = await createImageBitmap(file)
		return {
			source: bitmap,
			width: bitmap.width,
			height: bitmap.height,
			cleanup: () => bitmap.close()
		}
	}

	if (typeof Image === 'undefined' || typeof URL === 'undefined') {
		throw new Error('Image processing is not available in this browser.')
	}

	const objectUrl = URL.createObjectURL(file)
	const image = new Image()
	image.decoding = 'async'

	try {
		await new Promise<void>((resolve, reject) => {
			image.onload = () => resolve()
			image.onerror = () => reject(new Error('The image could not be decoded.'))
			image.src = objectUrl
		})

		return {
			source: image,
			width: image.naturalWidth,
			height: image.naturalHeight,
			cleanup: () => URL.revokeObjectURL(objectUrl)
		}
	} catch (error) {
		URL.revokeObjectURL(objectUrl)
		throw error
	}
}

function canvasToBlob(
	canvas: HTMLCanvasElement,
	quality: number
): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (!blob) {
					reject(new Error('The cover image could not be encoded.'))
					return
				}
				resolve(blob)
			},
			'image/webp',
			quality
		)
	})
}

export async function processRecordCoverFile(
	file: File,
	crop: RecordCoverCrop
): Promise<Blob> {
	const fileError = validateRecordCoverFile(file)
	if (fileError) throw new Error(fileError)
	if (typeof document === 'undefined') {
		throw new Error('Image processing is not available in this browser.')
	}

	let decoded: DecodedImage
	try {
		decoded = await decodeRecordCover(file)
	} catch {
		throw new Error('The selected file is not a readable image.')
	}

	try {
		const dimensionError = validateRecordCoverDimensions(
			decoded.width,
			decoded.height
		)
		if (dimensionError) throw new Error(dimensionError)

		const canvas = document.createElement('canvas')
		canvas.width = RECORD_COVER_OUTPUT_SIZE
		canvas.height = RECORD_COVER_OUTPUT_SIZE
		const context = canvas.getContext('2d')
		if (!context) throw new Error('Image processing is not available.')

		const square = calculateSquareCrop(decoded.width, decoded.height, crop)
		context.drawImage(
			decoded.source,
			square.sourceX,
			square.sourceY,
			square.sourceSize,
			square.sourceSize,
			0,
			0,
			RECORD_COVER_OUTPUT_SIZE,
			RECORD_COVER_OUTPUT_SIZE
		)

		for (const quality of [0.82, 0.7, 0.55]) {
			const blob = await canvasToBlob(canvas, quality)
			if (blob.type !== 'image/webp') {
				throw new Error('This browser cannot create WebP cover images.')
			}
			if (blob.size <= RECORD_COVER_STORED_MAX_BYTES) return blob
		}

		throw new Error('The processed cover image is larger than 2 MB.')
	} finally {
		decoded.cleanup()
	}
}
