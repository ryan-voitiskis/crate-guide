// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import {
	normalizeForTrackMatch,
	parseRekordboxTonality,
	parseRekordboxXml
} from './rekordboxXml'

describe('parseRekordboxTonality', () => {
	it.each([
		['8A', { key: 9, mode: 0 }],
		['8B', { key: 0, mode: 1 }],
		['1a', { key: 8, mode: 0 }],
		['Am', { key: 9, mode: 0 }],
		['F#m', { key: 6, mode: 0 }],
		['Abm', { key: 8, mode: 0 }],
		['C', { key: 0, mode: 1 }],
		['F#', { key: 6, mode: 1 }],
		['Eb', { key: 3, mode: 1 }],
		['A Minor', { key: 9, mode: 0 }],
		['C Major', { key: 0, mode: 1 }]
	])('parses %s', (input, expected) => {
		expect(parseRekordboxTonality(input)).toMatchObject({
			...expected,
			warning: null
		})
	})

	it('returns a warning for unsupported values', () => {
		const result = parseRekordboxTonality('not a key')

		expect(result.key).toBeNull()
		expect(result.mode).toBeNull()
		expect(result.warning).toContain('Unsupported tonality')
	})
})

describe('normalizeForTrackMatch', () => {
	it('strips invisible characters, diacritics, punctuation, years, and prefixes', () => {
		expect(normalizeForTrackMatch('01 - Cafe\u200b Society (2023)')).toBe(
			'cafe society'
		)
		expect(normalizeForTrackMatch('A1. Déjà Vu')).toBe('deja vu')
	})
})

describe('parseRekordboxXml', () => {
	it('parses collection tracks and ignores unknown attributes and child elements', () => {
		const result = parseRekordboxXml(`<?xml version="1.0" encoding="UTF-8"?>
			<DJ_PLAYLISTS Version="1.0.0">
				<PRODUCT Name="rekordbox"/>
				<COLLECTION Entries="3">
					<TRACK TrackID="1" Name="Cafe&#769; Track" Artist="Test Artist" Album="Synthetic Album" Genre="House" Kind="WAV File" TotalTime="225" Year="2024" AverageBpm="128.04" DateAdded="2026-07-09" BitRate="1411" SampleRate="44100" Comments="Imported" PlayCount="4" Rating="204" Location="file://localhost/Users/example/Music/Collection/Synthetic%20Album/01%20-%20Cafe%CC%81%20Track.wav" Remixer="Mixer" Tonality="8A" Label="Example Label" Unknown="ignored">
						<TEMPO Inizio="0" Bpm="128.04"/>
						<POSITION_MARK Name="Cue"/>
					</TRACK>
					<TRACK TrackID="2" Name="Lowercase Key" Artist="Other Artist" Album="" TotalTime="180" AverageBpm="0.00" Location="file://localhost/Users/example/Music/Collection/Other%20Album/Other%20Artist%20-%20Lowercase%20Key.flac" Tonality="1a"/>
					<TRACK TrackID="3" Name="Bare Note" Artist="Third Artist" Album="Third Album" TotalTime="200" AverageBpm="121.27" Location="file://localhost/Users/example/Music/Collection/Third%20Album/Bare%20Note.mp3" Tonality="F#"/>
				</COLLECTION>
			</DJ_PLAYLISTS>`)

		expect(result.errors).toEqual([])
		expect(result.entriesDeclared).toBe(3)
		expect(result.tracks).toHaveLength(3)
		expect(result.tracks[0]).toMatchObject({
			trackId: '1',
			name: 'Café Track',
			artist: 'Test Artist',
			album: 'Synthetic Album',
			averageBpm: 128,
			totalTimeSeconds: 225,
			parsedKey: 9,
			parsedMode: 0,
			locationHint: 'Synthetic Album/01 - Café Track.wav'
		})
		expect(result.tracks[0]?.locationHint).not.toContain('/Users/example')
		expect(result.tracks[1]).toMatchObject({
			album: null,
			averageBpm: null,
			parsedKey: 8,
			parsedMode: 0
		})
		expect(result.tracks[2]).toMatchObject({
			averageBpm: 121.3,
			parsedKey: 6,
			parsedMode: 1
		})
	})

	it('reports malformed XML as an error', () => {
		const result = parseRekordboxXml('<DJ_PLAYLISTS><COLLECTION><TRACK>')

		expect(result.tracks).toEqual([])
		expect(result.errors).toContain('Unable to parse rekordbox XML')
	})

	it('warns when the Entries attribute does not match parsed tracks', () => {
		const result = parseRekordboxXml(`
			<DJ_PLAYLISTS Version="1.0.0">
				<COLLECTION Entries="2">
					<TRACK Name="Only Track" Artist="Artist"/>
				</COLLECTION>
			</DJ_PLAYLISTS>`)

		expect(result.warnings[0]).toContain('declares 2 tracks')
	})

	it('keeps a relative folder hint for single-row imports', () => {
		const result = parseRekordboxXml(`
			<DJ_PLAYLISTS Version="1.0.0">
				<COLLECTION Entries="1">
					<TRACK Name="Only Track" Artist="Artist" Location="file://localhost/Users/example/Music/Collection/Synthetic%20Album/Only%20Track.wav"/>
				</COLLECTION>
			</DJ_PLAYLISTS>`)

		expect(result.tracks[0]?.locationHint).toBe(
			'Collection/Synthetic Album/Only Track.wav'
		)
		expect(result.tracks[0]?.locationHint).not.toContain('/Users/example')
	})

	it('keeps malformed percent-encoded locations non-fatal', () => {
		const result = parseRekordboxXml(`
			<DJ_PLAYLISTS Version="1.0.0">
				<COLLECTION Entries="1">
					<TRACK Name="Only Track" Artist="Artist" Location="file://localhost/Music/Album/Bad%ZZName.wav"/>
				</COLLECTION>
			</DJ_PLAYLISTS>`)

		expect(result.errors).toEqual([])
		expect(result.tracks[0]?.locationHint).toBe('Music/Album/Bad%ZZName.wav')
	})

	it('removes home-directory names from shallow location hints', () => {
		const result = parseRekordboxXml(`
			<DJ_PLAYLISTS Version="1.0.0">
				<COLLECTION Entries="1">
					<TRACK Name="Only Track" Artist="Artist" Location="file://localhost/Users/private-user/Only%20Track.wav"/>
				</COLLECTION>
			</DJ_PLAYLISTS>`)

		expect(result.tracks[0]?.locationHint).toBe('Only Track.wav')
		expect(result.tracks[0]?.locationHint).not.toContain('private-user')
	})
})
