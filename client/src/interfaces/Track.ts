interface Track {
  _id: string
  spotifyID?: string
  title: string
  artists?: string // * optional to allow for artists to be inferred from record artists
  position?: string
  duration?: number | null
  bpm?: number
  rpm: number
  key?: number
  mode?: number
  genre?: string
  playable: boolean
  audioFeatures?: {
    acousticness: number
    danceability: number
    duration_ms: number
    energy: number
    instrumentalness: number
    key: number
    liveness: number
    loudness: number
    mode: number
    speechiness: number
    tempo: number
    time_signature: number
    valence: number
  }
}

interface TrackPlus extends Track {
  recordID: string
  cover: string
  label: string
  year: number
  catno: string
  bpmFinal?: number
  artistsFinal: string
  durationFinal?: number
}

export { Track, TrackPlus }
