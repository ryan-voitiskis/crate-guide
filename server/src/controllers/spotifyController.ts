import asyncHandler from "express-async-handler"
import fetch from "node-fetch"
import levenshtein from "js-levenshtein"
import { ITrack, IRecord, Record } from "../models/recordModel.js"
import unsign from "../utils/unsign.js"
import { IUser, User } from "../models/userModel.js"
import { refreshToken } from "./spotifyOAuthController.js"

const spotifyAPIURL = "https://api.spotify.com/v1/"

const normaliseTitle = (title: string) =>
  title.toLowerCase().trim().replace(/\(|\)/g, "").replace(/ - /, " ")

const normaliseArtist = (artist: string) => artist.toLowerCase().trim()

interface SpotifyImage {
  url: string
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
  // total_tracks: number
}
interface SearchAlbumResponse {
  albums: {
    items: SearchAlbumItem[]
  }
}
interface SearchTrackItemArtist {
  name: string
}
interface searchTrackItem {
  artists: SearchTrackItemArtist[]
  name: string
  id: string
}
interface SearchTrackResponse {
  tracks: {
    items: searchTrackItem[]
  }
}

interface TrackQuery {
  artist: string
  track: string
}
interface AlbumQuery {
  artist: string
  album: string
  year?: number
}

const isSearchAlbumResponse = (obj: any): obj is SearchAlbumResponse => {
  return "albums" in obj
}

const isSearchTrackResponse = (obj: any): obj is SearchTrackResponse => {
  return "tracks" in obj
}

interface SearchAlbumResult {
  id: string
  levenshtein: number
  image?: string
  title?: string
  artist?: string
  external_url?: string
  release_date?: string
}

interface SearchTrackResult {
  id: string
  levenshtein: number
}

interface SpotifyTrack {
  id: string
  name: string
  artists: SpotifyArtist[]
  duration_ms: number
  external_urls: {
    spotify: string
  }
}

interface AlbumTracksResponse {
  items: SpotifyTrack[]
}

const isAlbumTracksResponsee = (obj: any): obj is AlbumTracksResponse => {
  return "items" in obj
}

interface ImperfectTrackMatchOption {
  name: string
  artists: string
  duration: number
  external_url: string
  levenshtein: number
}

interface FoundTrack {
  recordID: string
  trackID: string
  spotifyTrackID: string
}

interface ImperfectTrackMatches {
  recordID: string
  trackID: string
  options: ImperfectTrackMatchOption[]
}
interface TrackIDsFromAlbumResults {
  foundTracks: FoundTrack[]
  imperfectTrackMatches: ImperfectTrackMatches[]
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

const isAudioFeaturesResponse = (obj: any): obj is AudioFeaturesResponse => {
  return "audio_features" in obj
}

// @desc    finds corresponding spotify ID for albums and tracks, imports audio
//          features, writes to client imperfectAlbumMatches and noMatches
// @route   POST /api/spotify/import_data_for_selected
// @access  private
const findAndImportRecordAudioFeatures = asyncHandler(async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream")
  res.write("data: " + `0\n\n`)

  const recordIDs: string[] = JSON.parse(req.body.records)
  const records = await Record.find({ _id: { $in: recordIDs } })
  const user = await User.findById(req.user!.id)

  if (user && records) {
    let foundTracks: FoundTrack[] = []
    let imperfectTrackMatches: ImperfectTrackMatches[] = []
    const imperfectAlbumMatches = []
    const noMatches = []
    let i = 0
    for await (const record of records) {
      const query = {
        artist: record.artists.split(",")[0],
        album: record.title,
        year: record.year,
      }
      const searchAlbumResults = await searchAlbum(query, user.spotifyToken)
      if (searchAlbumResults.length) {
        // if perfect match found
        if (searchAlbumResults[0].levenshtein === 0) {
          Record.findByIdAndUpdate(record._id, {
            spotifyID: searchAlbumResults[0].id,
          })
          const getTrackIDsObj = await getTrackIDsFromAlbum(
            record,
            searchAlbumResults[0].id,
            user.spotifyToken
          )
          foundTracks = foundTracks.concat(getTrackIDsObj.foundTracks)
          imperfectTrackMatches = imperfectTrackMatches.concat(
            getTrackIDsObj.imperfectTrackMatches
          )
        }
        // if no perfect match found, but similar found
        else if (searchAlbumResults.length > 1)
          imperfectAlbumMatches.push({
            _id: record._id.toString(),
            matches: searchAlbumResults,
          })
      } else noMatches.push(record._id.toString())
      i++
      res.write("data: " + `${(i / (records.length + 1)).toFixed(2)}\n\n`) // + 1 as at least one more req for audio features
    }

    const retrievedFeatures: AudioFeatures[] = await getAudioFeatures(
      foundTracks.map((i) => i.spotifyTrackID),
      user.spotifyToken
    )

    if (!(await saveAudioFeatures(retrievedFeatures, foundTracks, user)))
      throw new Error("One or more tracks not updated with Audio Features.")

    if (imperfectAlbumMatches.length || noMatches.length)
      res.write(
        "data: " +
          `json:${JSON.stringify({
            imperfectAlbumMatches: imperfectAlbumMatches,
            noMatches: noMatches,
          })}\n\n`
      )
    else res.write("data: " + `1\n\n`)
    res.end()
  }
})

const spotifyRequest = async (url: string, token: string) => {
  const options = {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
  }
  const response = (await fetch(url, options)) as Response
  if (response.status === 200) return await response.json()
  else if (response.status === 401) {
    // ? possibly pass userID to spotifyRequest and get spotifyToken after each request
    // refreshToken(token)
    const error = await response.json()
    const errorMsg = error.message ? error.message : "Bad or expired token."
    throw new Error(errorMsg)
  } else if (response.status === 403) {
    const error = await response.json()
    const errorMsg = error.message ? error.message : "Bad OAuth request"
    throw new Error(errorMsg)
  } else if (response.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 10000))
    const response = (await spotifyRequest(url, token)) as Response
    return await response.json()
  }
  return await response.json()
}

const searchAlbum = async (
  query: AlbumQuery,
  token: string
): Promise<SearchAlbumResult[]> => {
  const matches: SearchAlbumResult[] = []
  const params = new URLSearchParams()
  params.append("q", JSON.stringify(query))
  params.append("type", "album")
  params.append("limit", "50")
  const url = `${spotifyAPIURL}search?${params}`
  const searchAlbumResponse = await spotifyRequest(url, token)
  if (isSearchAlbumResponse(searchAlbumResponse)) {
    if (searchAlbumResponse.albums.items.length) {
      const queryArtist = normaliseArtist(query.artist)
      const queryAlbum = normaliseArtist(query.album)
      for (const item of searchAlbumResponse.albums.items) {
        const foundArtist = normaliseArtist(item.artists[0].name)
        const foundAlbum = normaliseArtist(item.name)
        if (foundArtist === queryArtist && foundAlbum === queryAlbum) {
          return [{ id: item.id, levenshtein: 0 }]
        }
        let distance
        if (foundArtist === queryArtist) {
          distance = levenshtein(foundAlbum, queryAlbum)
        } else {
          const artistDistance = levenshtein(foundArtist, queryArtist)
          const albumDistance = levenshtein(foundAlbum, queryAlbum)
          distance = artistDistance + albumDistance
        }
        if (query.year) {
          const foundYear = new Date(item.release_date).getFullYear()
          distance = distance + unsign(query.year - foundYear)
        }
        matches.push({
          id: item.id,
          levenshtein: distance,
          image: item.images[0].url,
          title: item.name,
          artist: item.artists.map((i) => i.name).join(", "),
          external_url: item.external_urls.spotify,
          release_date: item.release_date,
        })
      }
    }
  }
  return matches.sort((a, b) => a.levenshtein - b.levenshtein).slice(0, 8)
}

const getTrackIDsFromAlbum = async (
  record: IRecord,
  albumID: string,
  token: string
): Promise<TrackIDsFromAlbumResults> => {
  const imperfectTrackMatches: ImperfectTrackMatches[] = []
  const foundTracks: FoundTrack[] = []
  const albumTracks = await getAlbumTracks(albumID, token)
  if (albumTracks.length) {
    for (const track of record.tracks) {
      const matchedTrack = albumTracks.find(
        (i) => normaliseTitle(i.name) === normaliseTitle(track.title)
      )
      if (matchedTrack)
        foundTracks.push({
          recordID: record._id.toString(),
          trackID: track._id.toString(),
          spotifyTrackID: matchedTrack.id,
        })
      else {
        const possibilities = []
        for (const spotifyTrack of albumTracks) {
          possibilities.push({
            name: spotifyTrack.name,
            artists: spotifyTrack.artists.map((i) => i.name).join(", "),
            duration: spotifyTrack.duration_ms,
            external_url: spotifyTrack.external_urls.spotify,
            levenshtein: levenshtein(track.title, spotifyTrack.name),
          })
        }
        imperfectTrackMatches.push({
          recordID: record._id.toString(),
          trackID: track._id.toString(),
          options: possibilities
            .sort((a, b) => a.levenshtein - b.levenshtein)
            .slice(0, 3),
        })
      }
    }
  }
  return {
    foundTracks: foundTracks,
    imperfectTrackMatches: imperfectTrackMatches,
  }
}

const getAlbumTracks = async (albumID: string, token: string) => {
  const params = new URLSearchParams()
  params.append("limit", "50")
  const url = `${spotifyAPIURL}albums/${albumID}/tracks`
  const tracks = await spotifyRequest(url, token)
  if (isAlbumTracksResponsee(tracks)) {
    return tracks.items
  }
  return []
}

const getAudioFeatures = async (trackIDs: string[], token: string) => {
  const batchSize = 100
  const batches = []
  let retrievedFeatures: AudioFeatures[] = []
  for (let i = 0; i < trackIDs.length; i += batchSize)
    batches.push(trackIDs.slice(i, i + batchSize))
  for (const batch of batches) {
    const params = new URLSearchParams()
    params.append("ids", batch.join(","))
    const url = `${spotifyAPIURL}audio-features?${params}`
    const audioFeaturesResponse = await spotifyRequest(url, token)
    if (isAudioFeaturesResponse(audioFeaturesResponse)) {
      retrievedFeatures = retrievedFeatures.concat(
        audioFeaturesResponse.audio_features
      )
    }
  }
  return retrievedFeatures
}

const saveAudioFeatures = async (
  audioFeatures: AudioFeatures[],
  tracks: FoundTrack[],
  user: IUser
) => {
  let error = false
  for (const features of audioFeatures) {
    const track = tracks.find((i) => i.spotifyTrackID === features.id)
    if (track) {
      const updatedRecord = await Record.findOneAndUpdate(
        { _id: track.recordID, user: user._id, "tracks._id": track.trackID },
        {
          $set: {
            "tracks.$.audioFeatures": editedAudioFeatures(features),
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

const editedAudioFeatures = (features: AudioFeatures) => {
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

// @desc    imports audio features for provided spotify album and track IDs
// @route   POST /api/spotify/import_data_for_client_matched
// @access  private
const importRecordAudioFeatures = asyncHandler(async (req, res) => {})

// const searchTrack = async (
//   query: TrackQuery,
//   token: string
// ): Promise<SearchTrackResult | null> => {
//   const params = new URLSearchParams()
//   params.append("q", JSON.stringify(query))
//   params.append("type", "track")
//   params.append("limit", "50")
//   const url = `${spotifyAPIURL}search?${params}`
//   const response = await fetch(url, getRequestOptions(token))
//   const SearchTrackResponse = await response.json()
//   if (isSearchTrackResponse(SearchTrackResponse)) {
//     if (SearchTrackResponse.tracks.items.length) {
//       const queryArtist = query.artist.toLocaleLowerCase()
//       const queryTrack = query.track.toLocaleLowerCase()
//       for (const item of SearchTrackResponse.tracks.items) {
//         const foundArtist = item.artists[0].name.toLocaleLowerCase()
//         const foundTrack = item.name.toLocaleLowerCase()
//         if (foundArtist === queryArtist) {
//           if (foundTrack === queryTrack) {
//             return { id: item.id, levenshtein: 0 }
//           } else {
//             const distance = levenshtein(foundTrack, queryTrack)
//             console.log(distance + " - " + foundTrack + " | " + queryTrack)
//             if (distance < 10) return { id: item.id, levenshtein: distance }
//           }
//         }
//       }
//     }
//   }
//   return null
// }

// @desc    removes discogs API creds from user
// @route   GET /api/spotify/track
// @access  private
// const searchAlbum = asyncHandler(async (req, res) => {
//   const user = await User.findById(req.user!.id)
//   if (user) {
//     const params = new URLSearchParams()
//     params.append(
//       "q",
//       JSON.stringify({ artist: "Soul Capsule", track: "Lady" })
//     )
//     params.append("type", "track")
//     const url = `${spotifyAPIURL}search?${params}`

//     const response = await fetch(url, getRequestOptions(token))

//     const track = await response.json()
//     res.status(200).json(track)
//   }
// })

// for await (const track of record.tracks as ITrack[]) {
//   const query = {
//     artist: track.artists
//       ? track.artists.split(",")[0]
//       : record.artists.split(",")[0],
//     track: track.title,
//   }
//   const foundTracks = await searchTrack(query, user.spotifyToken)
//   const editedTrack = {
//     // foundTracks[0]
//   }
//   trackIDs.push(foundTracks)
// }

export { findAndImportRecordAudioFeatures, importRecordAudioFeatures }
