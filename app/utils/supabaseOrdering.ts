const POSTGRES_TIMESTAMP_PATTERN =
	/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/

export type CreatedAtRow = {
	id: string
	created_at: string | null
}

export function postgresTimestampMicroseconds(value: string): bigint | null {
	const match = POSTGRES_TIMESTAMP_PATTERN.exec(value)
	if (!match) return null

	const [
		,
		yearValue,
		monthValue,
		dayValue,
		hourValue,
		minuteValue,
		secondValue,
		fraction = '',
		offset,
		offsetSign,
		offsetHourValue,
		offsetMinuteValue
	] = match
	const year = Number(yearValue)
	const month = Number(monthValue)
	const day = Number(dayValue)
	const hour = Number(hourValue)
	const minute = Number(minuteValue)
	const second = Number(secondValue)
	const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
	const daysInMonth = [
		31,
		isLeapYear ? 29 : 28,
		31,
		30,
		31,
		30,
		31,
		31,
		30,
		31,
		30,
		31
	]

	if (
		year < 1 ||
		month < 1 ||
		month > 12 ||
		day < 1 ||
		day > daysInMonth[month - 1]! ||
		hour > 23 ||
		minute > 59 ||
		second > 59
	) {
		return null
	}

	let offsetMinutes = 0
	if (offset !== 'Z') {
		const offsetHours = Number(offsetHourValue)
		const offsetMinute = Number(offsetMinuteValue)
		if (
			offsetHours > 14 ||
			offsetMinute > 59 ||
			(offsetHours === 14 && offsetMinute !== 0)
		) {
			return null
		}
		offsetMinutes =
			(offsetHours * 60 + offsetMinute) * (offsetSign === '-' ? -1 : 1)
	}

	const date = new Date(0)
	date.setUTCFullYear(year, month - 1, day)
	date.setUTCHours(hour, minute, second, 0)
	const absoluteMilliseconds =
		BigInt(date.getTime()) - BigInt(offsetMinutes) * 60_000n

	return absoluteMilliseconds * 1000n + BigInt(fraction.padEnd(6, '0'))
}

export function compareCreatedAtDescIdDesc<T extends CreatedAtRow>(
	left: T,
	right: T
): number {
	const leftCreatedAt =
		typeof left.created_at === 'string'
			? postgresTimestampMicroseconds(left.created_at)
			: null
	const rightCreatedAt =
		typeof right.created_at === 'string'
			? postgresTimestampMicroseconds(right.created_at)
			: null

	if (leftCreatedAt === null && rightCreatedAt !== null) return 1
	if (leftCreatedAt !== null && rightCreatedAt === null) return -1
	if (leftCreatedAt !== null && rightCreatedAt !== null) {
		if (leftCreatedAt > rightCreatedAt) return -1
		if (leftCreatedAt < rightCreatedAt) return 1
	}

	if (left.id === right.id) return 0
	return left.id > right.id ? -1 : 1
}

export function sortCreatedAtDescIdDesc<T extends CreatedAtRow>(
	rows: readonly T[]
): T[] {
	return [...rows].sort(compareCreatedAtDescIdDesc)
}
