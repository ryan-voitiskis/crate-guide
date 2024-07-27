interface SpotifyTrackEdit {
  id: string
  name: string
  artists: string
  external_url: string
  release_date: string
  levenshtein: number
  image: string
  selected?: boolean
}

interface InexactTrackMatch {
  recordID: string
  trackID: string
  options: SpotifyTrackEdit[]
}

export { SpotifyTrackEdit, InexactTrackMatch }
