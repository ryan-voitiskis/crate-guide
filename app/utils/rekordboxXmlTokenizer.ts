export type IncrementalXmlTokenizerLimits = {
	maxXmlDepth: number
	maxMarkupBytes: number
	maxAttributesPerElement: number
	maxAttributeBytes: number
	maxElementNameBytes: number
	maxEntityLength: number
}

export type IncrementalXmlStartElement = {
	name: string
	attributes: ReadonlyMap<string, string>
	depth: number
	selfClosing: boolean
}

export type IncrementalXmlEndElement = {
	name: string
	depth: number
}

export type IncrementalXmlTokenizerHandlers = {
	onStartElement: (element: IncrementalXmlStartElement) => void
	onEndElement: (element: IncrementalXmlEndElement) => void
	onXmlDeclaration?: (attributes: ReadonlyMap<string, string>) => void
}

export type IncrementalXmlTokenizerErrorCode =
	'doctype_forbidden' | 'malformed_xml' | 'resource_limit_exceeded'

export class IncrementalXmlTokenizerError extends Error {
	readonly code: IncrementalXmlTokenizerErrorCode

	constructor(code: IncrementalXmlTokenizerErrorCode, message: string) {
		super(message)
		this.name = 'IncrementalXmlTokenizerError'
		this.code = code
	}
}

const XML_NAME = /^[A-Za-z_:][A-Za-z0-9_.:-]*/
const XML_WHITESPACE = /[\t\n\r ]/
const textEncoder = new TextEncoder()

function utf8Bytes(value: string): number {
	return textEncoder.encode(value).byteLength
}

function failMalformed(message = 'Unable to parse Rekordbox XML'): never {
	throw new IncrementalXmlTokenizerError('malformed_xml', message)
}

function isValidXmlCodePoint(codePoint: number): boolean {
	return (
		codePoint === 0x9 ||
		codePoint === 0xa ||
		codePoint === 0xd ||
		(codePoint >= 0x20 && codePoint <= 0xd7ff) ||
		(codePoint >= 0xe000 && codePoint <= 0xfffd) ||
		(codePoint >= 0x10000 && codePoint <= 0x10ffff)
	)
}

function assertValidXmlCharacters(value: string): void {
	for (const character of value) {
		const codePoint = character.codePointAt(0)!
		if (!isValidXmlCodePoint(codePoint)) failMalformed()
	}
}

function decodeEntity(entity: string): string {
	switch (entity) {
		case 'amp':
			return '&'
		case 'lt':
			return '<'
		case 'gt':
			return '>'
		case 'quot':
			return '"'
		case 'apos':
			return "'"
		default:
			break
	}

	let codePoint: number | null = null
	if (/^#[0-9]+$/.test(entity)) {
		codePoint = Number.parseInt(entity.slice(1), 10)
	} else if (/^#x[0-9a-f]+$/i.test(entity)) {
		codePoint = Number.parseInt(entity.slice(2), 16)
	}
	if (
		codePoint === null ||
		!Number.isSafeInteger(codePoint) ||
		!isValidXmlCodePoint(codePoint)
	) {
		failMalformed()
	}
	return String.fromCodePoint(codePoint)
}

export function decodeXmlAttributeValue(
	value: string,
	maxEntityLength: number
): string {
	const normalizedValue = value.replace(/\r\n?/g, '\n')
	let decoded = ''
	for (let index = 0; index < normalizedValue.length;) {
		const character = normalizedValue[index]!
		if (character === '<') failMalformed()
		if (character !== '&') {
			const codePoint = normalizedValue.codePointAt(index)!
			if (!isValidXmlCodePoint(codePoint)) failMalformed()
			const literal = String.fromCodePoint(codePoint)
			decoded += XML_WHITESPACE.test(literal) ? ' ' : literal
			index += literal.length
			continue
		}

		const terminator = normalizedValue.indexOf(';', index + 1)
		if (terminator === -1) failMalformed()
		const entity = normalizedValue.slice(index + 1, terminator)
		if (!entity || entity.length > maxEntityLength || entity.includes('&')) {
			failMalformed()
		}
		decoded += decodeEntity(entity)
		index = terminator + 1
	}
	return decoded
}

function parseAttributes(
	value: string,
	limits: IncrementalXmlTokenizerLimits
): { name: string; attributes: Map<string, string> } {
	const nameMatch = value.match(XML_NAME)
	if (!nameMatch) failMalformed()
	const name = nameMatch[0]
	if (utf8Bytes(name) > limits.maxElementNameBytes) {
		throw new IncrementalXmlTokenizerError(
			'resource_limit_exceeded',
			'XML element or attribute name exceeds the supported limit.'
		)
	}

	const attributes = new Map<string, string>()
	let cursor = name.length
	while (cursor < value.length) {
		let sawWhitespace = false
		while (cursor < value.length && XML_WHITESPACE.test(value[cursor]!)) {
			sawWhitespace = true
			cursor += 1
		}
		if (cursor === value.length) break
		if (!sawWhitespace) failMalformed()

		const attributeMatch = value.slice(cursor).match(XML_NAME)
		if (!attributeMatch) failMalformed()
		const attributeName = attributeMatch[0]
		if (utf8Bytes(attributeName) > limits.maxElementNameBytes) {
			throw new IncrementalXmlTokenizerError(
				'resource_limit_exceeded',
				'XML element or attribute name exceeds the supported limit.'
			)
		}
		cursor += attributeName.length
		while (cursor < value.length && XML_WHITESPACE.test(value[cursor]!)) {
			cursor += 1
		}
		if (value[cursor] !== '=') failMalformed()
		cursor += 1
		while (cursor < value.length && XML_WHITESPACE.test(value[cursor]!)) {
			cursor += 1
		}
		const quote = value[cursor]
		if (quote !== '"' && quote !== "'") failMalformed()
		cursor += 1
		const endQuote = value.indexOf(quote, cursor)
		if (endQuote === -1) failMalformed()
		const rawAttributeValue = value.slice(cursor, endQuote)
		if (utf8Bytes(rawAttributeValue) > limits.maxAttributeBytes) {
			throw new IncrementalXmlTokenizerError(
				'resource_limit_exceeded',
				'XML attribute exceeds the supported limit.'
			)
		}
		const decoded = decodeXmlAttributeValue(
			rawAttributeValue,
			limits.maxEntityLength
		)
		if (utf8Bytes(decoded) > limits.maxAttributeBytes) {
			throw new IncrementalXmlTokenizerError(
				'resource_limit_exceeded',
				'XML attribute exceeds the supported limit.'
			)
		}
		if (attributes.has(attributeName)) failMalformed()
		attributes.set(attributeName, decoded)
		if (attributes.size > limits.maxAttributesPerElement) {
			throw new IncrementalXmlTokenizerError(
				'resource_limit_exceeded',
				'XML element has too many attributes.'
			)
		}
		cursor = endQuote + 1
	}

	return { name, attributes }
}

function findMarkupEnd(value: string): number {
	let quote: '"' | "'" | null = null
	for (let index = 1; index < value.length; index += 1) {
		const character = value[index]!
		if (quote) {
			if (character === quote) quote = null
			continue
		}
		if (character === '"' || character === "'") {
			quote = character
			continue
		}
		if (character === '>') return index
	}
	return -1
}

export class IncrementalXmlTokenizer {
	private buffer = ''
	private readonly elementStack: string[] = []
	private textEntity: string | null = null
	private textTail = ''
	private inCdata = false
	private sawRoot = false
	private rootClosed = false
	private atDocumentStart = true
	private xmlDeclarationAllowed = true
	private sawXmlDeclaration = false
	private finished = false

	constructor(
		private readonly limits: IncrementalXmlTokenizerLimits,
		private readonly handlers: IncrementalXmlTokenizerHandlers
	) {}

	write(chunk: string): void {
		if (this.finished) failMalformed()
		if (!chunk) return
		this.buffer += chunk
		this.drain(false)
	}

	finish(): void {
		if (this.finished) failMalformed()
		this.finished = true
		this.drain(true)
		if (
			this.inCdata ||
			this.buffer.length > 0 ||
			this.textEntity !== null ||
			this.elementStack.length > 0 ||
			!this.sawRoot ||
			!this.rootClosed
		) {
			failMalformed()
		}
	}

	private enforceMarkupLimit(): void {
		this.assertMarkupWithinLimit(this.buffer)
	}

	private assertMarkupWithinLimit(markup: string): void {
		if (utf8Bytes(markup) <= this.limits.maxMarkupBytes) return
		throw new IncrementalXmlTokenizerError(
			'resource_limit_exceeded',
			'XML markup exceeds the supported limit.'
		)
	}

	private consumeText(value: string): void {
		for (const character of value) {
			if (
				this.atDocumentStart &&
				this.elementStack.length === 0 &&
				!this.sawRoot &&
				character === '\ufeff'
			) {
				this.atDocumentStart = false
				continue
			}
			if (this.elementStack.length === 0 && !this.sawRoot) {
				this.atDocumentStart = false
				this.xmlDeclarationAllowed = false
			}
			if (this.textEntity !== null) {
				if (character === '&') failMalformed()
				if (character === ';') {
					if (!this.textEntity) failMalformed()
					decodeEntity(this.textEntity)
					this.textEntity = null
					continue
				}
				this.textEntity += character
				if (this.textEntity.length > this.limits.maxEntityLength) {
					failMalformed()
				}
				continue
			}

			if (character === '&') {
				if (this.elementStack.length === 0) failMalformed()
				this.textEntity = ''
				continue
			}
			if (this.elementStack.length === 0 && !XML_WHITESPACE.test(character)) {
				failMalformed()
			}
			assertValidXmlCharacters(character)
			this.textTail = `${this.textTail}${character}`.slice(-3)
			if (this.textTail === ']]>') failMalformed()
		}
	}

	private drain(final: boolean): void {
		while (this.buffer.length > 0) {
			if (this.inCdata) {
				const end = this.buffer.indexOf(']]>')
				if (end === -1) {
					const safeLength = Math.max(0, this.buffer.length - 2)
					assertValidXmlCharacters(this.buffer.slice(0, safeLength))
					this.buffer = this.buffer.slice(safeLength)
					return
				}
				assertValidXmlCharacters(this.buffer.slice(0, end))
				this.buffer = this.buffer.slice(end + 3)
				this.inCdata = false
				continue
			}

			const markupStart = this.buffer.indexOf('<')
			if (markupStart === -1) {
				this.consumeText(this.buffer)
				this.buffer = ''
				return
			}
			if (markupStart > 0) {
				this.consumeText(this.buffer.slice(0, markupStart))
				if (this.textEntity !== null) failMalformed()
				this.buffer = this.buffer.slice(markupStart)
				continue
			}
			this.textTail = ''

			if (this.buffer.startsWith('<![CDATA[')) {
				if (this.elementStack.length === 0) failMalformed()
				this.buffer = this.buffer.slice(9)
				this.inCdata = true
				continue
			}
			if ('<![CDATA['.startsWith(this.buffer) && !final) return

			if (this.buffer.startsWith('<!--')) {
				const end = this.buffer.indexOf('-->', 4)
				if (end === -1) {
					this.enforceMarkupLimit()
					return
				}
				this.assertMarkupWithinLimit(this.buffer.slice(0, end + 3))
				const comment = this.buffer.slice(4, end)
				if (comment.includes('--') || comment.endsWith('-')) failMalformed()
				assertValidXmlCharacters(comment)
				if (!this.sawRoot) this.xmlDeclarationAllowed = false
				this.atDocumentStart = false
				this.buffer = this.buffer.slice(end + 3)
				continue
			}
			if ('<!--'.startsWith(this.buffer) && !final) return

			if (/^<!doctype(?:\s|>)/i.test(this.buffer)) {
				throw new IncrementalXmlTokenizerError(
					'doctype_forbidden',
					'DOCTYPE and XML entities are not supported.'
				)
			}
			if (this.buffer.startsWith('<!')) {
				if (!final && this.buffer.length < 11) return
				throw new IncrementalXmlTokenizerError(
					'doctype_forbidden',
					'DOCTYPE and XML entities are not supported.'
				)
			}

			if (this.buffer.startsWith('<?')) {
				const end = this.buffer.indexOf('?>', 2)
				if (end === -1) {
					this.enforceMarkupLimit()
					return
				}
				this.assertMarkupWithinLimit(this.buffer.slice(0, end + 2))
				assertValidXmlCharacters(this.buffer.slice(2, end))
				const processingInstruction = this.buffer.slice(2, end)
				const targetMatch = processingInstruction.match(XML_NAME)
				if (!targetMatch) failMalformed()
				const target = targetMatch[0]
				if (utf8Bytes(target) > this.limits.maxElementNameBytes) {
					throw new IncrementalXmlTokenizerError(
						'resource_limit_exceeded',
						'XML element or attribute name exceeds the supported limit.'
					)
				}
				const processingInstructionData = processingInstruction.slice(
					target.length
				)
				if (
					processingInstructionData &&
					!XML_WHITESPACE.test(processingInstructionData[0]!)
				) {
					failMalformed()
				}
				if (target.toLowerCase() === 'xml') {
					if (
						this.sawRoot ||
						target !== 'xml' ||
						!this.xmlDeclarationAllowed ||
						this.sawXmlDeclaration
					) {
						failMalformed()
					}
					const parsed = parseAttributes(
						processingInstruction.trim(),
						this.limits
					)
					this.sawXmlDeclaration = true
					this.handlers.onXmlDeclaration?.(parsed.attributes)
				} else if (!this.sawRoot) {
					this.xmlDeclarationAllowed = false
				}
				this.atDocumentStart = false
				this.xmlDeclarationAllowed = false
				this.buffer = this.buffer.slice(end + 2)
				continue
			}
			if ('<?'.startsWith(this.buffer) && !final) return

			const end = findMarkupEnd(this.buffer)
			if (end === -1) {
				this.enforceMarkupLimit()
				return
			}
			this.assertMarkupWithinLimit(this.buffer.slice(0, end + 1))
			const markup = this.buffer.slice(1, end)
			this.buffer = this.buffer.slice(end + 1)
			this.consumeElement(markup)
		}

		if (final && this.textEntity !== null) failMalformed()
	}

	private consumeElement(markup: string): void {
		if (markup.startsWith('/')) {
			const rawName = markup.slice(1)
			if (!rawName || XML_WHITESPACE.test(rawName[0]!)) failMalformed()
			const name = rawName.trimEnd()
			if (!XML_NAME.test(name) || name.match(XML_NAME)?.[0] !== name) {
				failMalformed()
			}
			if (utf8Bytes(name) > this.limits.maxElementNameBytes) {
				throw new IncrementalXmlTokenizerError(
					'resource_limit_exceeded',
					'XML element or attribute name exceeds the supported limit.'
				)
			}
			const expected = this.elementStack.at(-1)
			if (!expected || expected !== name) failMalformed()
			const depth = this.elementStack.length - 1
			this.elementStack.pop()
			this.handlers.onEndElement({ name, depth })
			if (this.elementStack.length === 0) this.rootClosed = true
			return
		}

		if (!markup || XML_WHITESPACE.test(markup[0]!)) failMalformed()
		const trimmed = markup.trimEnd()
		const selfClosing = trimmed.endsWith('/')
		const body = selfClosing ? trimmed.slice(0, -1).trimEnd() : trimmed
		const { name, attributes } = parseAttributes(body, this.limits)
		if (this.rootClosed) failMalformed()
		this.atDocumentStart = false
		this.xmlDeclarationAllowed = false
		const depth = this.elementStack.length
		if (depth === 0) {
			if (this.sawRoot) failMalformed()
			this.sawRoot = true
		}
		if (depth + 1 > this.limits.maxXmlDepth) {
			throw new IncrementalXmlTokenizerError(
				'resource_limit_exceeded',
				'XML nesting exceeds the supported limit.'
			)
		}

		this.handlers.onStartElement({ name, attributes, depth, selfClosing })
		if (selfClosing) {
			this.handlers.onEndElement({ name, depth })
			if (depth === 0) this.rootClosed = true
			return
		}
		this.elementStack.push(name)
	}
}
