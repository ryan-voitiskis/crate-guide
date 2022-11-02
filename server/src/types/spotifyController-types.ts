import { IRecord } from "../models/recordModel"

interface TrackQuery {
  artist: string
  track: string
  year?: number
}

interface AlbumQuery {
  artist: string
  album: string
  year?: number
}

interface SpotifyImage {
  height: number
  url: string
  width: number
}

interface SpotifyArtist {
  name: string
}

interface SearchAlbumItem {
  artists: SpotifyArtist[]
  id: string
  name: string
  images: SpotifyImage[]
  external_urls: {
    spotify: string
  }
  release_date: string
}

interface SearchAlbumResponse {
  albums: {
    items: SearchAlbumItem[]
  }
}

interface SearchTrackItem {
  artists: SpotifyArtist[]
  id: string
  name: string
  images: SpotifyImage[]
  external_urls: {
    spotify: string
  }
  release_date: string
}

interface SearchTrackResponse {
  tracks: {
    items: SearchTrackItem[]
  }
}

function isSearchAlbumResponse(obj: any): obj is SearchAlbumResponse {
  return "albums" in obj
}

function isSearchTrackResponse(obj: any): obj is SearchTrackResponse {
  return "tracks" in obj
}

interface SpotifyAlbumEdit {
  id: string
  levenshtein: number
  image: string
  name: string
  artists: string
  external_url: string
  release_date: string
}

interface SpotifyTrackEdit {
  id: string
  name: string
  artists: string
  external_url: string
  release_date: string
  levenshtein: number
  image: string
}

interface SpotifyTrack {
  id: string
  name: string
  artists: SpotifyArtist[]
  external_urls: {
    spotify: string
  }
}

interface AlbumTracksResponse {
  items: SpotifyTrack[]
}

function isAlbumTracksResponse(obj: any): obj is AlbumTracksResponse {
  return "items" in obj
}

interface TracksTrack {
  album: {
    images: SpotifyImage[]
    release_date: string
  }
  artists: SpotifyArtist[]
  duration_ms: number
  external_urls: {
    spotify: string
  }
  id: string
  name: string
}

interface TracksResponse {
  tracks: TracksTrack[]
}

const isTracksResponse = (obj: any): obj is TracksResponse => {
  return "tracks" in obj
}

interface MatchedTrack {
  recordID: string
  trackID: string
  spotifyTrackID: string
}

interface MatchedAlbum {
  recordID: string
  album: SpotifyAlbumEdit
}

interface InexactTrackMatches {
  recordID: string
  trackID: string
  options: SpotifyTrackEdit[]
}

interface InexactAlbumMatches {
  recordID: string
  matches: SpotifyAlbumEdit[]
}

interface AudioFeatures {
  acousticness: number
  analysis_url: string
  danceability: number
  duration_ms: number
  energy: number
  id: string
  instrumentalness: number
  key: number
  liveness: number
  loudness: number
  mode: number
  speechiness: number
  tempo: number
  time_signature: number
  track_href: string
  type: string
  uri: string
  valence: number
}

interface AudioFeaturesResponse {
  audio_features: AudioFeatures[]
}

function isAudioFeaturesResponse(obj: any): obj is AudioFeaturesResponse {
  return "audio_features" in obj
}

interface UnfoundTrack {
  recordID: string
  trackID: string
}

interface ImportRecordState {
  records: IRecord[]
  matchedTracks: MatchedTrack[]
  inexactTrackMatches: InexactTrackMatches[]
  inexactAlbumMatches: InexactAlbumMatches[]
  unmatchedAlbums: string[]
  unfoundTracks: UnfoundTrack[]
  requestsMade: number
  requestsRequired: number
}

interface ImportMatchedState {
  matchedAlbums: MatchedAlbum[]
  matchedTracks: MatchedTrack[]
  unmatchedAlbums: string[]
  inexactTrackMatches: InexactTrackMatches[]
  unfoundTracks: UnfoundTrack[]
  requestsMade: number
  requestsRequired: number
}

export {
  TrackQuery,
  AlbumQuery,
  SpotifyImage,
  SpotifyArtist,
  SearchAlbumItem,
  SearchAlbumResponse,
  SearchTrackItem,
  SearchTrackResponse,
  isSearchAlbumResponse,
  isSearchTrackResponse,
  SpotifyAlbumEdit,
  SpotifyTrackEdit,
  SpotifyTrack,
  AlbumTracksResponse,
  isAlbumTracksResponse,
  TracksTrack,
  TracksResponse,
  isTracksResponse,
  MatchedTrack,
  MatchedAlbum,
  InexactTrackMatches,
  InexactAlbumMatches,
  AudioFeatures,
  AudioFeaturesResponse,
  isAudioFeaturesResponse,
  UnfoundTrack,
  ImportRecordState,
  ImportMatchedState,
}
