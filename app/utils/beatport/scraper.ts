interface BeatportTrackData {
	accessed: number
	url: string
	genre: string
	bpm: number | null
	key: string
	img: string
}

interface SearchTrackParams {
	artist: string
	title: string
}

export async function searchBeatportTrack({
	artist,
	title
}: SearchTrackParams): Promise<BeatportTrackData | null> {
	try {
		const query = `${artist} ${title}`
		const response = await $fetch<string>(`/api/beatport/search?q=${encodeURIComponent(query)}`)

		return parseBeatportHTML(response, { artist, title })
	} catch (error) {
		console.error('Failed to search Beatport:', error)
		return null
	}
}

function parseBeatportHTML(html: string, { artist, title }: SearchTrackParams): BeatportTrackData | null {
	const parser = new DOMParser()
	const doc = parser.parseFromString(html, 'text/html')

	const trackRows = doc.querySelectorAll('[data-testid="tracks-table-row"]')

	for (const row of trackRows) {
		const trackData = extractTrackDataFromRow(row)
		if (trackData && isTrackMatch(trackData, { artist, title })) {
			return {
				accessed: Date.now(),
				...trackData
			}
		}
	}

	return null
}

function extractTrackDataFromRow(row: Element): Omit<BeatportTrackData, 'accessed'> | null {
	try {
		// Extract track URL and title
		const trackLink = row.querySelector('a[href^="/track/"]')
		if (!trackLink) return null

		const url = `https://www.beatport.com${trackLink.getAttribute('href')}`

		// Extract artist name
		const artistLink = row.querySelector('.ArtistNames-sc-f2e950a1-0 a')
		if (!artistLink) return null

		const artistName = artistLink.getAttribute('title') || artistLink.textContent?.trim()
		if (!artistName) return null

		// Extract track title (handle remix info in spans)
		const titleElement = row.querySelector('.Tables-shared-style__ReleaseName-sc-74ae448d-5')
		if (!titleElement) return null

		let trackTitle = ''
		for (const child of titleElement.childNodes) {
			if (child.nodeType === Node.TEXT_NODE) {
				trackTitle += child.textContent?.trim() || ''
			} else if (child.nodeName === 'SPAN') {
				const spanText = child.textContent?.trim() || ''
				// Only include meaningful remix info, skip redundant ones like "Original Mix"
				if (spanText && spanText !== 'Original Mix') {
					trackTitle += ` ${spanText}`
				}
			}
		}
		trackTitle = trackTitle.trim()

		// Extract BPM and key
		let bpm: number | null = null
		let key = ''

		const bpmKeyElement = row.querySelector('.cell.bpm div:last-child')
		if (bpmKeyElement) {
			const bpmKeyText = bpmKeyElement.textContent?.trim() || ''
			const match = bpmKeyText.match(/(\d+(?:\.\d+)?)\s*BPM\s*-\s*(.+)/)
			if (match) {
				bpm = parseFloat(match[1]!)
				key = match[2]!.trim()
			}
		}

		// Extract genre
		const genreLink = row.querySelector('.cell.bpm a[href^="/genre/"]')
		const genre = genreLink?.getAttribute('title') || genreLink?.textContent?.trim() || ''

		// Extract image
		const img = row.querySelector('img')
		const imgSrc = img?.getAttribute('src') || ''

		return {
			url,
			genre,
			bpm,
			key,
			img: imgSrc,
			// Store extracted values for matching
			_artistName: artistName,
			_trackTitle: trackTitle
		} as any
	} catch (error) {
		console.error('Error extracting track data:', error)
		return null
	}
}

function isTrackMatch(
	extractedData: any,
	searchParams: SearchTrackParams
): boolean {
	const { artist, title } = searchParams
	const { _artistName, _trackTitle } = extractedData

	// Artist must match exactly (case-insensitive)
	const artistMatch = _artistName.toLowerCase() === artist.toLowerCase()

	// Track title should contain our search title (case-insensitive)
	const titleMatch = _trackTitle.toLowerCase().includes(title.toLowerCase()) ||
		title.toLowerCase().includes(_trackTitle.toLowerCase())

	return artistMatch && titleMatch
}
