import { describe, expect, it } from 'vitest'

import {
	normalizeArtist,
	transformRelease,
	transformReleaseArtists,
	transformReleaseLabels,
	transformReleaseTracks
} from './discogs-data'

import {
	createMockDiscogsArtist,
	createMockDiscogsLabel,
	createMockDiscogsReleaseFull,
	createMockDiscogsTrack,
	mockDiscogsReleases
} from 'test/mocks/fixtures/discogs'

describe('normalizeArtist', () => {
	it('trims whitespace', () => {
		expect(normalizeArtist('  Artist Name  ')).toBe('Artist Name')
	})

	it('removes single-digit Discogs disambiguation numbers', () => {
		expect(normalizeArtist('John Smith (2)')).toBe('John Smith')
	})

	it('removes multi-digit Discogs disambiguation numbers', () => {
		expect(normalizeArtist('The Artist (123)')).toBe('The Artist')
	})

	it('handles empty string', () => {
		expect(normalizeArtist('')).toBe('')
	})

	it('handles null/undefined gracefully', () => {
		expect(normalizeArtist(null as unknown as string)).toBe('')
		expect(normalizeArtist(undefined as unknown as string)).toBe('')
	})

	it('preserves parentheses not matching disambiguation pattern', () => {
		expect(normalizeArtist('Artist (Live)')).toBe('Artist (Live)')
		expect(normalizeArtist('Artist (UK)')).toBe('Artist (UK)')
	})

	it('handles artist names with spaces before parentheses', () => {
		expect(normalizeArtist('DJ Shadow (3)')).toBe('DJ Shadow')
	})

	it('handles artist names with no disambiguation', () => {
		expect(normalizeArtist('Aphex Twin')).toBe('Aphex Twin')
	})
})

describe('transformReleaseArtists', () => {
	it('transforms array of Discogs artists to database format', () => {
		const artists = [
			createMockDiscogsArtist({ id: 1, name: 'Artist One', role: 'Main' }),
			createMockDiscogsArtist({ id: 2, name: 'Artist Two', role: '' })
		]

		const result = transformReleaseArtists(artists)

		expect(result).toHaveLength(2)
		expect(result[0]).toEqual({
			discogs_id: 1,
			name: 'Artist One',
			role: 'Main'
		})
		expect(result[1]).toEqual({
			discogs_id: 2,
			name: 'Artist Two',
			role: null
		})
	})

	it('normalizes artist names with disambiguation numbers', () => {
		const artists = [
			createMockDiscogsArtist({ id: 1, name: 'John Smith (2)' })
		]

		const result = transformReleaseArtists(artists)

		expect(result[0]?.name).toBe('John Smith')
	})

	it('handles empty array', () => {
		expect(transformReleaseArtists([])).toEqual([])
	})
})

describe('transformReleaseLabels', () => {
	it('transforms array of Discogs labels to database format', () => {
		const labels = [
			createMockDiscogsLabel({
				id: 1,
				name: 'Label One',
				catno: 'LAB001',
				entity_type: '1',
				thumbnail_url: 'https://example.com/thumb.jpg'
			})
		]

		const result = transformReleaseLabels(labels)

		expect(result).toHaveLength(1)
		expect(result[0]).toEqual({
			discogs_id: 1,
			name: 'Label One',
			catno: 'LAB001',
			entity_type: '1',
			thumbnail_url: 'https://example.com/thumb.jpg'
		})
	})

	it('removes disambiguation numbers from label names', () => {
		const labels = [createMockDiscogsLabel({ name: 'Warp Records (2)' })]

		const result = transformReleaseLabels(labels)

		expect(result[0]?.name).toBe('Warp Records')
	})

	it('trims label name and catno', () => {
		const labels = [
			createMockDiscogsLabel({ name: '  Spaced Label  ', catno: '  CAT001  ' })
		]

		const result = transformReleaseLabels(labels)

		expect(result[0]?.name).toBe('Spaced Label')
		expect(result[0]?.catno).toBe('CAT001')
	})

	it('handles missing optional fields', () => {
		const labels = [
			createMockDiscogsLabel({
				name: 'Label',
				catno: '',
				entity_type: '',
				thumbnail_url: undefined
			})
		]

		const result = transformReleaseLabels(labels)

		expect(result[0]?.catno).toBe('')
		expect(result[0]?.entity_type).toBe('')
		expect(result[0]?.thumbnail_url).toBe('')
	})

	it('handles empty array', () => {
		expect(transformReleaseLabels([])).toEqual([])
	})

	it('handles null/undefined gracefully', () => {
		expect(transformReleaseLabels(null as unknown as [])).toEqual([])
		expect(transformReleaseLabels(undefined as unknown as [])).toEqual([])
	})
})

describe('transformReleaseTracks', () => {
	describe('title building', () => {
		it('trims track title', () => {
			const release = createMockDiscogsReleaseFull({
				tracklist: [createMockDiscogsTrack({ title: '  Track Title  ' })]
			})

			const result = transformReleaseTracks(release)

			expect(result[0]?.title).toBe('Track Title')
		})

		it('uses "Untitled" for empty or missing title', () => {
			const release = createMockDiscogsReleaseFull({
				tracklist: [createMockDiscogsTrack({ title: '' })]
			})

			const result = transformReleaseTracks(release)

			expect(result[0]?.title).toBe('Untitled')
		})

		it('appends remix artist suffix when extraartist has suffixable role', () => {
			const release = createMockDiscogsReleaseFull({
				tracklist: [
					createMockDiscogsTrack({
						title: 'Track Name',
						extraartists: [
							createMockDiscogsArtist({ name: 'Remixer', role: 'Remix' })
						]
					})
				]
			})

			const result = transformReleaseTracks(release)

			expect(result[0]?.title).toBe('Track Name (Remixer Remix)')
		})

		it('does not append suffix if title already ends with parenthesis', () => {
			const release = createMockDiscogsReleaseFull({
				tracklist: [
					createMockDiscogsTrack({
						title: 'Track (Original Mix)',
						extraartists: [
							createMockDiscogsArtist({ name: 'Remixer', role: 'Remix' })
						]
					})
				]
			})

			const result = transformReleaseTracks(release)

			expect(result[0]?.title).toBe('Track (Original Mix)')
		})

		it('handles all suffixable roles', () => {
			const suffixableRoles = [
				'mix',
				'remix',
				're-mix',
				're-edit',
				'edit',
				'dub',
				'version'
			]

			for (const role of suffixableRoles) {
				const release = createMockDiscogsReleaseFull({
					tracklist: [
						createMockDiscogsTrack({
							title: 'Track',
							extraartists: [
								createMockDiscogsArtist({ name: 'Artist', role })
							]
						})
					]
				})

				const result = transformReleaseTracks(release)

				expect(result[0]?.title).toBe(`Track (Artist ${role})`)
			}
		})

		it('handles case-insensitive role matching', () => {
			const release = createMockDiscogsReleaseFull({
				tracklist: [
					createMockDiscogsTrack({
						title: 'Track',
						extraartists: [
							createMockDiscogsArtist({ name: 'Remixer', role: 'REMIX' })
						]
					})
				]
			})

			const result = transformReleaseTracks(release)

			expect(result[0]?.title).toBe('Track (Remixer REMIX)')
		})

		it('normalizes remixer name in title suffix', () => {
			const release = createMockDiscogsReleaseFull({
				tracklist: [
					createMockDiscogsTrack({
						title: 'Track',
						extraartists: [
							createMockDiscogsArtist({ name: 'Remixer (2)', role: 'Remix' })
						]
					})
				]
			})

			const result = transformReleaseTracks(release)

			expect(result[0]?.title).toBe('Track (Remixer Remix)')
		})
	})

	describe('artist inheritance', () => {
		it('uses track artists when present', () => {
			const release = createMockDiscogsReleaseFull({
				artists: [createMockDiscogsArtist({ id: 1, name: 'Release Artist' })],
				tracklist: [
					createMockDiscogsTrack({
						title: 'Track',
						artists: [createMockDiscogsArtist({ id: 2, name: 'Track Artist' })]
					})
				]
			})

			const result = transformReleaseTracks(release)

			expect(result[0]?.artists).toHaveLength(1)
			expect(result[0]?.artists[0]?.name).toBe('Track Artist')
		})

		it('inherits release artists when track has no artists', () => {
			const release = createMockDiscogsReleaseFull({
				artists: [createMockDiscogsArtist({ id: 1, name: 'Release Artist' })],
				tracklist: [
					createMockDiscogsTrack({
						title: 'Track',
						artists: undefined
					})
				]
			})

			const result = transformReleaseTracks(release)

			expect(result[0]?.artists).toHaveLength(1)
			expect(result[0]?.artists[0]?.name).toBe('Release Artist')
		})

		it('normalizes all artist names', () => {
			const release = createMockDiscogsReleaseFull({
				tracklist: [
					createMockDiscogsTrack({
						title: 'Track',
						artists: [createMockDiscogsArtist({ name: 'Artist (5)' })]
					})
				]
			})

			const result = transformReleaseTracks(release)

			expect(result[0]?.artists[0]?.name).toBe('Artist')
		})
	})

	describe('extraartists', () => {
		it('transforms extraartists array', () => {
			const release = createMockDiscogsReleaseFull({
				tracklist: [
					createMockDiscogsTrack({
						title: 'Track',
						extraartists: [
							createMockDiscogsArtist({
								id: 1,
								name: 'Producer',
								role: 'Producer'
							}),
							createMockDiscogsArtist({
								id: 2,
								name: 'Engineer',
								role: 'Engineer'
							})
						]
					})
				]
			})

			const result = transformReleaseTracks(release)

			expect(result[0]?.extraartists).toHaveLength(2)
			expect(result[0]?.extraartists[0]?.name).toBe('Producer')
			expect(result[0]?.extraartists[0]?.role).toBe('Producer')
		})

		it('handles empty extraartists', () => {
			const release = createMockDiscogsReleaseFull({
				tracklist: [
					createMockDiscogsTrack({
						title: 'Track',
						extraartists: undefined
					})
				]
			})

			const result = transformReleaseTracks(release)

			expect(result[0]?.extraartists).toEqual([])
		})
	})

	describe('position parsing', () => {
		it('accepts standard position format A1, B2, etc', () => {
			const release = createMockDiscogsReleaseFull({
				tracklist: [
					createMockDiscogsTrack({ position: 'A1' }),
					createMockDiscogsTrack({ position: 'B12' })
				]
			})

			const result = transformReleaseTracks(release)

			expect(result[0]?.position).toBe('A1')
			expect(result[1]?.position).toBe('B12')
		})

		it('converts alphabetic positions (AA, AAA) to numbered format', () => {
			const release = createMockDiscogsReleaseFull({
				tracklist: [
					createMockDiscogsTrack({ position: 'AA' }),
					createMockDiscogsTrack({ position: 'AAA' }),
					createMockDiscogsTrack({ position: 'AAAA' })
				]
			})

			const result = transformReleaseTracks(release)

			expect(result[0]?.position).toBe('A2')
			expect(result[1]?.position).toBe('A3')
			expect(result[2]?.position).toBe('A4')
		})

		it('returns null for invalid position formats', () => {
			const release = createMockDiscogsReleaseFull({
				tracklist: [
					createMockDiscogsTrack({ position: '1' }),
					createMockDiscogsTrack({ position: '' }),
					createMockDiscogsTrack({ position: 'A1-A2' })
				]
			})

			const result = transformReleaseTracks(release)

			expect(result[0]?.position).toBeNull()
			expect(result[1]?.position).toBeNull()
			expect(result[2]?.position).toBeNull()
		})

		it('handles single letter positions', () => {
			const release = createMockDiscogsReleaseFull({
				tracklist: [
					createMockDiscogsTrack({ position: 'A' }),
					createMockDiscogsTrack({ position: 'B' })
				]
			})

			const result = transformReleaseTracks(release)

			expect(result[0]?.position).toBe('A1')
			expect(result[1]?.position).toBe('B1')
		})
	})

	describe('duration parsing', () => {
		it('converts MM:SS to milliseconds', () => {
			const release = createMockDiscogsReleaseFull({
				tracklist: [createMockDiscogsTrack({ duration: '3:45' })]
			})

			const result = transformReleaseTracks(release)

			expect(result[0]?.duration).toBe(225000) // (3*60 + 45) * 1000
		})

		it('handles single-digit minutes', () => {
			const release = createMockDiscogsReleaseFull({
				tracklist: [createMockDiscogsTrack({ duration: '5:30' })]
			})

			const result = transformReleaseTracks(release)

			expect(result[0]?.duration).toBe(330000)
		})

		it('handles double-digit minutes', () => {
			const release = createMockDiscogsReleaseFull({
				tracklist: [createMockDiscogsTrack({ duration: '12:00' })]
			})

			const result = transformReleaseTracks(release)

			expect(result[0]?.duration).toBe(720000)
		})

		it('returns null for empty duration', () => {
			const release = createMockDiscogsReleaseFull({
				tracklist: [createMockDiscogsTrack({ duration: '' })]
			})

			const result = transformReleaseTracks(release)

			expect(result[0]?.duration).toBeNull()
		})

		it('returns null for invalid duration format', () => {
			const release = createMockDiscogsReleaseFull({
				tracklist: [createMockDiscogsTrack({ duration: 'invalid' })]
			})

			const result = transformReleaseTracks(release)

			expect(result[0]?.duration).toBeNull()
		})
	})

	describe('RPM detection', () => {
		it('returns 45 when format descriptions include "45"', () => {
			const release = mockDiscogsReleases.rpm45()

			const result = transformReleaseTracks(release)

			expect(result[0]?.rpm).toBe(45)
		})

		it('defaults to 33 otherwise', () => {
			const release = mockDiscogsReleases.standardEp()

			const result = transformReleaseTracks(release)

			expect(result[0]?.rpm).toBe(33)
		})
	})

	describe('genres from styles', () => {
		it('uses release.styles as track genres', () => {
			const release = createMockDiscogsReleaseFull({
				styles: ['House', 'Deep House', 'Acid House'],
				tracklist: [createMockDiscogsTrack({})]
			})

			const result = transformReleaseTracks(release)

			expect(result[0]?.genres).toEqual(['House', 'Deep House', 'Acid House'])
		})

		it('returns empty array when no styles', () => {
			const release = createMockDiscogsReleaseFull({
				styles: undefined,
				tracklist: [createMockDiscogsTrack({})]
			})

			const result = transformReleaseTracks(release)

			expect(result[0]?.genres).toEqual([])
		})
	})

	describe('default values', () => {
		it('sets null for BPM, key, mode, and time signatures', () => {
			const release = createMockDiscogsReleaseFull({
				tracklist: [createMockDiscogsTrack({})]
			})

			const result = transformReleaseTracks(release)

			expect(result[0]?.bpm).toBeNull()
			expect(result[0]?.key).toBeNull()
			expect(result[0]?.mode).toBeNull()
			expect(result[0]?.time_signature_upper).toBeNull()
			expect(result[0]?.time_signature_lower).toBeNull()
		})

		it('sets playable to true', () => {
			const release = createMockDiscogsReleaseFull({
				tracklist: [createMockDiscogsTrack({})]
			})

			const result = transformReleaseTracks(release)

			expect(result[0]?.playable).toBe(true)
		})
	})
})

describe('transformRelease', () => {
	const userId = 'test-user-id'

	it('transforms complete release to database format', () => {
		const release = mockDiscogsReleases.standardEp()

		const result = transformRelease(release, userId)

		expect(result.user_id).toBe(userId)
		expect(result.discogs_id).toBe(release.id)
		expect(result.discogs_release_url).toBe(release.uri)
		expect(result.title).toBe(release.title)
		expect(result.year).toBe(release.year)
		expect(result.artists).toHaveLength(1)
		expect(result.labels).toHaveLength(1)
		expect(result.tracks).toHaveLength(4)
	})

	it('trims release title', () => {
		const release = createMockDiscogsReleaseFull({
			title: '  Spaced Title  '
		})

		const result = transformRelease(release, userId)

		expect(result.title).toBe('Spaced Title')
	})

	it('extracts primary image as cover', () => {
		const release = mockDiscogsReleases.standardEp()

		const result = transformRelease(release, userId)

		expect(result.cover).toBe(release.images[0]?.resource_url)
	})

	it('falls back to first image when no primary', () => {
		const release = mockDiscogsReleases.secondaryImageOnly()

		const result = transformRelease(release, userId)

		expect(result.cover).toBe(release.images[0]?.resource_url)
	})

	it('returns null cover when no images', () => {
		const release = mockDiscogsReleases.noImages()

		const result = transformRelease(release, userId)

		expect(result.cover).toBeNull()
	})

	it('handles null year', () => {
		const release = createMockDiscogsReleaseFull({
			year: 0
		})

		const result = transformRelease(release, userId)

		expect(result.year).toBeNull()
	})
})
