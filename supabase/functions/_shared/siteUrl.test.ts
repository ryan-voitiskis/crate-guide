import assert from 'node:assert/strict'
import { parseSiteUrl } from './siteUrl.ts'

for (const [value, expectedOrigin] of [
	['http://localhost:3000', 'http://localhost:3000'],
	['http://localhost:3000/', 'http://localhost:3000'],
	['  https://crate.guide/  ', 'https://crate.guide'],
	['https://crate.guide', 'https://crate.guide']
] as const) {
	Deno.test(`normalizes SITE_URL ${JSON.stringify(value)}`, () => {
		assert.deepEqual(parseSiteUrl(value), {
			siteBaseUrl: `${expectedOrigin}/`,
			siteOrigin: expectedOrigin
		})
	})
}

for (const value of [
	undefined,
	'',
	'not a url',
	'ftp://crate.guide',
	'https://user@crate.guide',
	'https://user:secret@crate.guide',
	'https://crate.guide/app',
	'https://crate.guide/?mode=test',
	'https://crate.guide/#fragment'
]) {
	Deno.test(`rejects invalid SITE_URL ${JSON.stringify(value)}`, () => {
		assert.throws(
			() => parseSiteUrl(value),
			/SITE_URL must be one absolute HTTP\(S\) origin/
		)
	})
}
