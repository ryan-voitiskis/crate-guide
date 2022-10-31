import asyncHandler from "express-async-handler"
import fetch from "node-fetch"
import levenshtein from "js-levenshtein"
import { ITrack, IRecord, Record } from "../models/recordModel.js"
import unsign from "../utils/unsign.js"
import { IUser, User } from "../models/userModel.js"
import { refreshToken } from "./spotifyOAuthController.js"

const spotifyAPIURL = "https://api.spotify.com/v1/"

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

const isSearchAlbumResponse = (obj: any): obj is SearchAlbumResponse => {
  return "albums" in obj
}

const isSearchTrackResponse = (obj: any): obj is SearchTrackResponse => {
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

const isAlbumTracksResponse = (obj: any): obj is AlbumTracksResponse => {
  return "items" in obj
}

interface FoundTrack {
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

interface TrackIDsFromAlbumResults {
  foundTracks: FoundTrack[]
  inexactTrackMatches: InexactTrackMatches[]
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

interface UnmatchedTrack {
  recordID: string
  trackID: string
}

// @desc    finds corresponding spotify ID for albums and tracks, imports audio
//          features, writes to client inexactAlbumMatches and noMatches
// @route   POST /api/spotify/import_data_for_selected
// @access  private
const findAndImportRecordAudioFeatures = asyncHandler(async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream")
  const user = req.user! as IUser
  const recordIDs: string[] = JSON.parse(req.body.records)
  const records = await Record.find({ _id: { $in: recordIDs } })
  if (!records) throw new Error("No records found.")
  let foundTracks: FoundTrack[] = []
  let inexactTrackMatches: InexactTrackMatches[] = []
  const inexactAlbumMatches = []
  const noMatches = []
  let i = 0
  for await (const record of records) {
    const query = {
      artist: record.artists.split(",")[0],
      album: record.title,
      year: record.year,
    }
    const searchAlbumResults = await searchAlbum(query, user)
    if (searchAlbumResults.length) {
      // if perfect match found
      if (searchAlbumResults[0].levenshtein === 0) {
        await Record.findByIdAndUpdate(record._id, {
          spotifyID: searchAlbumResults[0].id,
        })
        const getTrackIDsObj = await getAlbumTracks(
          record,
          user,
          searchAlbumResults[0]
        )
        foundTracks = foundTracks.concat(getTrackIDsObj.foundTracks)
        inexactTrackMatches = inexactTrackMatches.concat(
          getTrackIDsObj.inexactTrackMatches
        )
      }
      // if no perfect match found, but similar found
      else
        inexactAlbumMatches.push({
          _id: record._id.toString(),
          matches: searchAlbumResults,
        })
    } else noMatches.push(record._id.toString())
    i++
    res.write("data: " + `${(i / records.length).toFixed(2)}\n\n`)
  }

  const retrievedFeatures: AudioFeatures[] = await getAudioFeatures(
    foundTracks.map((i) => i.spotifyTrackID),
    user
  )

  if (!(await saveAudioFeatures(retrievedFeatures, foundTracks, user)))
    throw new Error("One or more tracks not updated with Audio Features.")

  if (
    inexactAlbumMatches.length ||
    noMatches.length ||
    inexactTrackMatches.length
  )
    res.write(
      "data: " +
        `json:${JSON.stringify({
          inexactAlbumMatches: inexactAlbumMatches,
          inexactTrackMatches: inexactTrackMatches,
          noMatches: noMatches,
        })}\n\n`
    )
  else res.write("data: " + `1\n\n`)
  res.end()
})

// @desc    imports audio features for provided spotify album and track IDs
// @route   POST /api/spotify/import_data_for_client_matched
// @access  private
const importMatchedAudioFeatures = asyncHandler(async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream")
  const user = req.user! as IUser
  const matchedAlbums: MatchedAlbum[] = JSON.parse(req.body.matchedAlbums)
  let matchedTracks: FoundTrack[] = JSON.parse(req.body.matchedTracks)
  const unmatchedAlbums: string[] = JSON.parse(req.body.unmatchedAlbums)
  const unmatchedTracks: UnmatchedTrack[] = JSON.parse(req.body.unmatchedTracks)
  let inexactTrackMatches: InexactTrackMatches[] = []

  // *----------------- handle unmatched tracks
  for (const unmatchedTrack of unmatchedTracks) {
    const record = await Record.findOne({
      user: user._id,
      _id: unmatchedTrack.recordID,
    })
    if (!record) throw new Error("Couldn't find record of an unmatched track.")
    const track = record.tracks.find(
      (i) => i._id.toString() === unmatchedTrack.trackID
    )
    if (!track) throw new Error("Couldn't find an unmatched track.")
    const query = {
      artist: track.artists
        ? track.artists.split(",")[0]
        : record.artists.split(",")[0],
      track: track.title,
      year: record.year,
    }
    const searchTrackResults = await searchTrack(query, user)
    if (searchTrackResults.length) {
      // if perfect match found
      if (searchTrackResults[0].levenshtein === 0) {
        matchedTracks.push({
          recordID: record._id.toString(),
          trackID: track._id.toString(),
          spotifyTrackID: searchTrackResults[0].id,
        })
      }
      // if no perfect match found, but similar found
      // TODO: continue from here
      else {
        const options = [] // options to present to client for matching
        for (const spotifyTrack of searchTrackResults) {
          options.push({
            id: spotifyTrack.id,
            name: spotifyTrack.name,
            artists: spotifyTrack.artists,
            external_url: spotifyTrack.external_url,
            // todo: new distance?
            levenshtein: levenshtein(track.title, spotifyTrack.name),
            image: image,
          })
        }
        inexactTrackMatches.push({
          recordID: record._id.toString(),
          trackID: track._id.toString(),
          options: options
            .sort((a, b) => a.levenshtein - b.levenshtein)
            .slice(0, 4),
        })
      }
    } else noMatches.push(record._id.toString())
  }
  // *-----------------------

  for (const matchedAlbum of matchedAlbums) {
    const record = await Record.findById(matchedAlbum.recordID)
    if (!record) throw new Error("A Record couldnt be found.")
    const albumTracks = await getAlbumTracks(record, user, matchedAlbum.album)
    matchedTracks = matchedTracks.concat(albumTracks.foundTracks)
    inexactTrackMatches = inexactTrackMatches.concat(
      albumTracks.inexactTrackMatches
    )
  }

  // get audio features of matched tracks
  const retrievedFeatures: AudioFeatures[] = await getAudioFeatures(
    matchedTracks.map((i) => i.spotifyTrackID),
    user
  )

  // save audio features of matched tracks
  if (!(await saveAudioFeatures(retrievedFeatures, matchedTracks, user)))
    throw new Error("One or more tracks not updated with Audio Features.")

  if (inexactTrackMatches.length)
    res.write(
      "data: " +
        `json:${JSON.stringify({
          inexactTrackMatches: inexactTrackMatches,
        })}\n\n`
    )
  else res.write("data: " + `1\n\n`)
  res.end()
})

const spotifyRequest = async (url: string, user: IUser): Promise<{}> => {
  const options = {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${user.spotifyToken}`,
    },
  }
  const response = (await fetch(url, options)) as Response
  if (response.status === 200) return await response.json()
  else if (response.status === 401) {
    await refreshToken(user.spotifyToken) // call refreshToken before error, so that on retry refreshed token exists
    throw new Error("Bad token") // front end will retry upon receiving this msg
  } else if (response.status === 403) {
    const error = await response.json()
    const errorMsg = error.message ? error.message : "Bad OAuth request"
    throw new Error(errorMsg)
  } else if (response.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 10000))
    return await spotifyRequest(url, user) // todo: test this works
  }
  return await response.json()
}

const searchAlbum = async (
  query: AlbumQuery,
  user: IUser
): Promise<SpotifyAlbumEdit[]> => {
  const inexactAlbumMatches: SpotifyAlbumEdit[] = []
  const params = new URLSearchParams()
  params.append("q", JSON.stringify(query))
  params.append("type", "album")
  params.append("limit", "50")
  const url = `${spotifyAPIURL}search?${params}`
  const response = await spotifyRequest(url, user)
  if (!isSearchAlbumResponse(response)) throw new Error("Bad spotify response.")
  if (response.albums.items.length) {
    const queryArtist = normaliseArtist(query.artist)
    const queryAlbum = normaliseArtist(query.album)
    for (const item of response.albums.items) {
      const foundArtist = normaliseArtist(item.artists[0].name)
      const foundAlbum = normaliseArtist(item.name)
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
        distance = distance + unsign(query.year - foundYear)
      }
      inexactAlbumMatches.push(editSpotifyAlbum(item, distance))
    }
  }
  return inexactAlbumMatches
    .sort((a, b) => a.levenshtein - b.levenshtein)
    .slice(0, 8)
}

const editSpotifyAlbum = (
  item: SearchAlbumItem,
  distance: number
): SpotifyAlbumEdit => {
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

const searchTrack = async (
  query: TrackQuery,
  user: IUser
): Promise<SpotifyTrackEdit[]> => {
  const inexactTrackMatches: SpotifyTrackEdit[] = []
  const params = new URLSearchParams()
  params.append("q", JSON.stringify(query))
  params.append("type", "track")
  params.append("limit", "50")
  const url = `${spotifyAPIURL}search?${params}`
  const response = await spotifyRequest(url, user)
  if (!isSearchTrackResponse(response)) throw new Error("Bad spotify response.")
  if (response.tracks.items.length) {
    const queryArtist = query.artist.toLocaleLowerCase()
    const queryTrack = query.track.toLocaleLowerCase()
    for (const item of response.tracks.items) {
      const foundArtist = item.artists[0].name.toLocaleLowerCase()
      const foundTrack = item.name.toLocaleLowerCase()
      if (foundArtist === queryArtist && foundTrack === queryTrack)
        return [editSpotifyTrack(item, 0)]
      let distance
      if (foundArtist === queryArtist)
        distance = levenshtein(foundTrack, queryTrack)
      else {
        const artistDistance = levenshtein(foundArtist, queryArtist)
        const trackDistance = levenshtein(foundTrack, queryTrack)
        distance = artistDistance + trackDistance
      }
      if (query.year) {
        const foundYear = new Date(item.release_date).getFullYear()
        distance = distance + unsign(query.year - foundYear)
      }
      inexactTrackMatches.push(editSpotifyTrack(item, distance))
    }
  }
  return inexactTrackMatches
    .sort((a, b) => a.levenshtein - b.levenshtein)
    .slice(0, 8)
}

const editSpotifyTrack = (
  item: SearchTrackItem,
  distance: number
): SpotifyTrackEdit => {
  return {
    id: item.id,
    name: item.name,
    artists: item.artists.map((i) => i.name).join(", "),
    external_url: item.external_urls.spotify,
    release_date: item.release_date,
    levenshtein: distance,
    image: item.images[0].url,
  }
}

const getAlbumTracks = async (
  record: IRecord,
  user: IUser,
  album: SpotifyAlbumEdit
): Promise<TrackIDsFromAlbumResults> => {
  const inexactTrackMatches: InexactTrackMatches[] = []
  const foundTracks: FoundTrack[] = []
  const params = new URLSearchParams()
  params.append("limit", "50")
  const url = `${spotifyAPIURL}albums/${album.id}/tracks`
  const response = await spotifyRequest(url, user)
  if (!isAlbumTracksResponse(response)) throw new Error("Bad spotify response.")
  const albumTracks = response.items
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
        const options = [] // options to present to client for matching
        for (const spotifyTrack of albumTracks) {
          options.push({
            id: spotifyTrack.id,
            name: spotifyTrack.name,
            artists: spotifyTrack.artists.map((i) => i.name).join(", "),
            external_url: spotifyTrack.external_urls.spotify,
            levenshtein: levenshtein(track.title, spotifyTrack.name),
            image: album.image,
            release_date: album.release_date,
          })
        }
        inexactTrackMatches.push({
          recordID: record._id.toString(),
          trackID: track._id.toString(),
          options: options
            .sort((a, b) => a.levenshtein - b.levenshtein)
            .slice(0, 4),
        })
      }
    }
  }
  return {
    foundTracks: foundTracks,
    inexactTrackMatches: inexactTrackMatches,
  }
}

const getAudioFeatures = async (trackIDs: string[], user: IUser) => {
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

const editAudioFeatures = (features: AudioFeatures) => {
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

const normaliseTitle = (title: string) =>
  title.toLowerCase().trim().replace(/\(|\)/g, "").replace(/ - /, " ")

const normaliseArtist = (artist: string) => artist.toLowerCase().trim()

export { findAndImportRecordAudioFeatures, importMatchedAudioFeatures }
