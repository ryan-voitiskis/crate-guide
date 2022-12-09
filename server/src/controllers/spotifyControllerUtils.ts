import { Record } from "../models/recordModel.js"
import { IUser } from "../models/userModel.js"
import { spotifyRequest } from "./spotifyOAuthController.js"
import levenshtein from "js-levenshtein"
import {
  TrackQuery,
  AlbumQuery,
  SearchAlbumItem,
  SearchTrackItem,
  SpotifyAlbumEdit,
  SpotifyTrackEdit,
  MatchedTrack,
  AudioFeatures,
  isAudioFeatures,
  isAudioFeaturesResponse,
  isSearchAlbumResponse,
  isSearchTrackResponse,
  isTracksResponse,
} from "../types/spotifyController-types.js"
const spotifyAPIURL = "https://api.spotify.com/v1/"

async function searchAlbum(
  query: AlbumQuery,
  user: IUser
): Promise<SpotifyAlbumEdit[]> {
  const inexactAlbumMatches: SpotifyAlbumEdit[] = []
  const params = new URLSearchParams()
  params.append("q", optimiseAlbumQuery(query))
  params.append("type", "album")
  params.append("limit", "50")
  const url = `${spotifyAPIURL}search?${params}`
  const response = await spotifyRequest(url, user)
  if (!isSearchAlbumResponse(response))
    throw new Error("Bad spotify response. (Search albums)")
  if (response.albums.items.length) {
    const queryArtist = normalise(query.artist)
    const queryAlbum = normalise(query.album)
    for (const item of response.albums.items) {
      const foundArtist = normalise(item.artists[0].name)
      const foundAlbum = normalise(item.name)
      if (foundArtist === queryArtist && foundAlbum === queryAlbum)
        return [editSpotifyAlbum(item, 0)]
      let distance
      if (foundArtist === queryArtist)
        distance = levenshtein(foundAlbum, queryAlbum)
      else {
        const artistDistance = levenshtein(foundArtist, queryArtist)
        const albumDistance = levenshtein(foundAlbum, queryAlbum)
        distance = artistDistance + albumDistance
      }
      if (query.year) {
        const foundYear = new Date(item.release_date).getFullYear()
        distance = distance + Math.abs(query.year - foundYear)
      }
      inexactAlbumMatches.push(editSpotifyAlbum(item, distance))
    }
  }
  return inexactAlbumMatches.sort(sortLevenshtein).slice(0, 8)
}

async function searchTrack(
  query: TrackQuery,
  user: IUser
): Promise<SpotifyTrackEdit[]> {
  const queryArtist = query.artists.map((i) => normalise(i)).join(" ")
  const queryTrack = normaliseTitle(query.track)
  const options: string[] = []
  const params = new URLSearchParams()
  params.append("q", optimiseTrackQuery(query))
  params.append("type", "track")
  params.append("limit", "50")
  const url = `${spotifyAPIURL}search?${params}`
  const response = await spotifyRequest(url, user)
  if (!isSearchTrackResponse(response))
    throw new Error("Bad spotify response. (Search tracks)")
  if (response.tracks.items.length) {
    for (const item of response.tracks.items) {
      const foundArtist = item.artists.map((i) => normalise(i.name)).join(" ")
      const foundTrack = normaliseTitle(item.name)
      if (foundArtist === queryArtist && foundTrack === queryTrack)
        return [exactSpotifyTrack(item)]
      options.push(item.id)
    }
  }
  if (options.length) return await getTrackOptions(options, query, user)
  else return []
}

// gets the whole track options, as track search doesn't return image and release_date
async function getTrackOptions(
  options: string[],
  query: TrackQuery,
  user: IUser
): Promise<SpotifyTrackEdit[]> {
  const queryArtist = query.artists.map((i) => normalise(i)).join(" ")
  const queryTrack = normaliseTitle(query.track)
  const url = `${spotifyAPIURL}tracks/?ids=${options.join(",")}`
  const response = await spotifyRequest(url, user)
  if (!isTracksResponse(response))
    throw new Error("Bad spotify response. (Tracks)")
  const tracks = response.tracks
  const optionsFull: SpotifyTrackEdit[] = []
  for (const track of tracks) {
    let distance
    const foundArtist = track.artists.map((i) => normalise(i.name)).join(" ")
    const foundTrack = normaliseTitle(track.name)
    if (foundArtist === queryArtist)
      distance = levenshtein(foundTrack, queryTrack)
    else {
      const artistDistance = levenshtein(foundArtist, queryArtist)
      const trackDistance = levenshtein(foundTrack, queryTrack)
      distance = artistDistance + trackDistance
    }
    if (query.year) {
      const foundYear = new Date(track.album.release_date).getFullYear()
      distance = distance + Math.abs(query.year - foundYear)
    }
    const image640 = track.album.images.find((i) => i.height === 640)
    optionsFull.push({
      id: track.id,
      name: track.name,
      artists: track.artists.map((i) => i.name).join(", "),
      external_url: track.external_urls.spotify,
      release_date: track.album.release_date,
      levenshtein: distance,
      image: image640 ? image640.url : track.album.images[0].url,
    })
  }
  return optionsFull.sort(sortLevenshtein).slice(0, 8)
}

async function getAudioFeatures(
  trackIDs: string[],
  user: IUser
): Promise<AudioFeatures[]> {
  const batchSize = 100
  const batches = []
  let retrievedFeatures: AudioFeatures[] = []
  for (let i = 0; i < trackIDs.length; i += batchSize)
    batches.push(trackIDs.slice(i, i + batchSize))
  for (const batch of batches) {
    const params = new URLSearchParams()
    params.append("ids", batch.join(","))
    const url = `${spotifyAPIURL}audio-features?${params}`
    const audioFeaturesResponse = await spotifyRequest(url, user)
    if (isAudioFeaturesResponse(audioFeaturesResponse)) {
      retrievedFeatures = retrievedFeatures.concat(
        audioFeaturesResponse.audio_features
      )
    }
  }
  return retrievedFeatures
}

async function getAudioFeaturesSingle(
  trackID: string,
  user: IUser
): Promise<AudioFeatures | null> {
  const url = `${spotifyAPIURL}audio-features/${trackID}`
  const audioFeaturesResponse = await spotifyRequest(url, user)
  if (isAudioFeatures(audioFeaturesResponse)) return audioFeaturesResponse
  return null
}

async function saveAudioFeatures(
  audioFeatures: AudioFeatures[],
  tracks: MatchedTrack[],
  user: IUser
): Promise<boolean> {
  let error = false
  for (const features of audioFeatures) {
    const track = tracks.find((i) => i.spotifyTrackID === features.id)
    if (track) {
      const updatedRecord = await Record.findOneAndUpdate(
        { _id: track.recordID, user: user._id, "tracks._id": track.trackID },
        {
          $set: {
            "tracks.$.audioFeatures": editAudioFeatures(features),
            "tracks.$.spotifyID": track.spotifyTrackID,
          },
        },
        { new: true }
      )
      if (updatedRecord === null) error = true
    }
  }
  return !error // returns false if error
}

function editSpotifyAlbum(
  item: SearchAlbumItem,
  distance: number
): SpotifyAlbumEdit {
  return {
    id: item.id,
    levenshtein: distance,
    image: item.images[0].url,
    name: item.name,
    artists: item.artists.map((i) => i.name).join(", "),
    external_url: item.external_urls.spotify,
    release_date: item.release_date,
  }
}

function exactSpotifyTrack(item: SearchTrackItem): SpotifyTrackEdit {
  return {
    id: item.id,
    name: "",
    artists: "",
    external_url: "",
    release_date: "",
    levenshtein: 0,
    image: "",
  }
}

function editAudioFeatures(features: AudioFeatures) {
  return {
    acousticness: features.acousticness,
    danceability: features.danceability,
    duration_ms: features.duration_ms,
    energy: features.energy,
    instrumentalness: features.instrumentalness,
    key: features.key,
    liveness: features.liveness,
    loudness: features.loudness,
    mode: features.mode,
    speechiness: features.speechiness,
    tempo: features.tempo,
    time_signature: features.time_signature,
    valence: features.valence,
  }
}

function optimiseAlbumQuery(query: AlbumQuery): string {
  if (query.artist === "Various") return query.album
  let queryString = `${query.album} ${query.artist}`.replaceAll("  ", " ")
  if (queryString.length <= 100) return queryString
  queryString = queryString.replaceAll(/\(|\)/g, "").replaceAll("  ", " ")
  if (queryString.length <= 100) return queryString
  return queryString.slice(0, 100)
}

function optimiseTrackQuery(query: TrackQuery): string {
  let queryString = `${query.track} ${query.artists.join(" ")}`
    .replaceAll(/\(|\)/g, "")
    .replaceAll("  ", " ")
    .replace(/Vinyl Edit|Vinyl edit|vinyl edit/, "")
  if (queryString.length <= 100) return queryString
  queryString = queryString.replace("Remix", "").replaceAll("  ", " ")
  if (queryString.length <= 100) return queryString
  return queryString.slice(0, 100)
}

function normaliseTitle(title: string) {
  return title.toLowerCase().trim().replace(/\(|\)/g, "").replace(/ - /, " ")
}

function normalise(artist: string) {
  return artist.toLowerCase().trim()
}

function sortLevenshtein(
  a: SpotifyAlbumEdit | SpotifyTrackEdit,
  b: SpotifyAlbumEdit | SpotifyTrackEdit
): number {
  return a.levenshtein - b.levenshtein
}

export {
  editAudioFeatures,
  editSpotifyAlbum,
  exactSpotifyTrack,
  getAudioFeatures,
  getAudioFeaturesSingle,
  normalise,
  normaliseTitle,
  optimiseAlbumQuery,
  optimiseTrackQuery,
  saveAudioFeatures,
  searchAlbum,
  searchTrack,
  sortLevenshtein,
}
