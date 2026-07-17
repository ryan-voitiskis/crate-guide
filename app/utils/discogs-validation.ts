export interface ImportRecordResult {
	success?: boolean
	record_id?: string
	tracks_inserted?: number
	already_exists?: boolean
	error?: string
}

export function isValidImportResult(
	result: unknown
): result is ImportRecordResult {
	return (
		typeof result === 'object' &&
		result !== null &&
		'success' in result &&
		typeof (result as ImportRecordResult).success === 'boolean'
	)
}

export function validateImportResult(result: unknown): ImportRecordResult {
	if (!isValidImportResult(result))
		throw new Error('Invalid response from import function')
	if (result.success !== true) throw new Error(result.error || 'Import failed')
	return result
}
