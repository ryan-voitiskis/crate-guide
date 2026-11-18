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

function createdAtKey(row: CreatedAtRow): bigint | null {
	return typeof row.created_at === 'string'
		? postgresTimestampMicroseconds(row.created_at)
		: null
}

function compareCreatedAtKeysDescIdDesc(
	leftCreatedAt: bigint | null,
	leftId: string,
	rightCreatedAt: bigint | null,
	rightId: string
): number {
	if (leftCreatedAt === null && rightCreatedAt !== null) return 1
	if (leftCreatedAt !== null && rightCreatedAt === null) return -1
	if (leftCreatedAt !== null && rightCreatedAt !== null) {
		if (leftCreatedAt > rightCreatedAt) return -1
		if (leftCreatedAt < rightCreatedAt) return 1
	}

	if (leftId === rightId) return 0
	return leftId > rightId ? -1 : 1
}

export function compareCreatedAtDescIdDesc<T extends CreatedAtRow>(
	left: T,
	right: T
): number {
	return compareCreatedAtKeysDescIdDesc(
		createdAtKey(left),
		left.id,
		createdAtKey(right),
		right.id
	)
}

/** Parses each timestamp once instead of twice per comparison. */
export function sortCreatedAtDescIdDesc<T extends CreatedAtRow>(
	rows: readonly T[]
): T[] {
	return rows
		.map((row) => ({ row, createdAt: createdAtKey(row) }))
		.sort((left, right) =>
			compareCreatedAtKeysDescIdDesc(
				left.createdAt,
				left.row.id,
				right.createdAt,
				right.row.id
			)
		)
		.map(({ row }) => row)
}
