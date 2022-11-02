import asyncHandler from "express-async-handler"
import levenshtein from "js-levenshtein"
import { IRecord, Record } from "../models/recordModel.js"
import unsign from "../utils/unsign.js"
import { IUser } from "../models/userModel.js"
import { spotifyRequest, checkRefreshToken } from "./spotifyOAuthController.js"
import { Response as ExpressResponse } from "express"
import {
  TrackQuery,
  AlbumQuery,
  SearchAlbumItem,
  SearchTrackItem,
  isSearchAlbumResponse,
  isSearchTrackResponse,
  SpotifyAlbumEdit,
  SpotifyTrackEdit,
  isAlbumTracksResponse,
  isTracksResponse,
  MatchedTrack,
  AudioFeatures,
  isAudioFeaturesResponse,
  ImportRecordState,
  ImportMatchedState,
} from "../types/spotifyController-types.js"
const spotifyAPIURL = "https://api.spotify.com/v1/"

// @desc    finds and imports spotify data for provided records, sends back albums and tracks for matching
// @route   POST /api/spotify/import_selected
// @access  private
const importRecordFeatures = asyncHandler(async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream")
  let user = req.user! as IUser
  await checkRefreshToken(user)
  const records = JSON.parse(req.body.records)
  const state: ImportRecordState = {
    records: await Record.find({ _id: { $in: records } }),
    matchedTracks: [],
    inexactTrackMatches: [],
    inexactAlbumMatches: [],
    unmatchedAlbums: [],
    requestsMade: 0,
    requestsRequired: records.length + 1,
  }

  if (!state.records) throw new Error("No records found.")

  await processRecords(user, state, res)
  state.requestsRequired += state.unmatchedAlbums.length
  await processUnmatchedAlbums(user, state, res)
  await processMatchedTracks(user, state)

  if (state.inexactAlbumMatches.length || state.inexactTrackMatches.length)
    res.write(
      "data: " +
        `json:${JSON.stringify({
          inexactAlbumMatches: state.inexactAlbumMatches,
          inexactTrackMatches: state.inexactTrackMatches,
        })}\n\n`
    )
  else res.write("data: " + `1\n\n`)
  res.end()
})

// @desc    imports matched records and tracks, sends back inexactTrackMatches
// @route   POST /api/spotify/import_matched
// @access  private
const importMatchedFeatures = asyncHandler(async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream")
  let user = req.user! as IUser
  await checkRefreshToken(user)
  const matchedAlbumsParsed = JSON.parse(req.body.matchedAlbums)
  const unmatchedAlbumsParsed = JSON.parse(req.body.unmatchedAlbums)
  const state: ImportMatchedState = {
    matchedAlbums: matchedAlbumsParsed,
    matchedTracks: JSON.parse(req.body.matchedTracks),
    unmatchedAlbums: unmatchedAlbumsParsed,
    inexactTrackMatches: [],
    requestsMade: 0,
    requestsRequired:
      matchedAlbumsParsed.length + unmatchedAlbumsParsed.length + 1,
  }

  await processUnmatchedAlbums(user, state, res)
  await getTracksFromMatchedAlbums(user, state, res)
  await processMatchedTracks(user, state)

  if (state.inexactTrackMatches.length)
    res.write(
      "data: " +
        `json:${JSON.stringify({
          inexactTrackMatches: state.inexactTrackMatches,
        })}\n\n`
    )
  else res.write("data: " + `1\n\n`)
  res.end()
})

async function processRecords(
  user: IUser,
  state: ImportRecordState,
  res: ExpressResponse
): Promise<void> {
  for (const record of state.records) {
    const query = {
      artist: record.artists.split(", ")[0],
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
        await getAlbumTracks(record, user, searchAlbumResults[0], state)
      }

      // if no perfect match found, but similar found
      else
        state.inexactAlbumMatches.push({
          recordID: record._id.toString(),
          matches: searchAlbumResults,
        })
    } else state.unmatchedAlbums.push(record._id.toString())
    state.requestsMade++
    res.write(
      "data: " +
        `${(state.requestsMade / state.requestsRequired).toFixed(2)}\n\n`
    )
  }
}

async function processUnmatchedAlbums(
  user: IUser,
  state: ImportMatchedState | ImportRecordState,
  res: ExpressResponse
): Promise<void> {
  for (const unmatchedAlbum of state.unmatchedAlbums) {
    const record = await Record.findOne({
      user: user._id,
      _id: unmatchedAlbum,
    })
    if (!record) throw new Error("Couldn't find record of an unmatched track.")
    for (const track of record.tracks) {
      const query = {
        artists: track.artists
          ? track.artists.split(", ")
          : record.artists.split(", "),
        track: track.title,
        year: record.year,
      }
      const searchTrackResults = await searchTrack(query, user)
      if (searchTrackResults.length) {
        // if perfect match found
        if (searchTrackResults[0].levenshtein === 0)
          state.matchedTracks.push({
            recordID: record._id.toString(),
            trackID: track._id.toString(),
            spotifyTrackID: searchTrackResults[0].id,
          })
        // if no perfect match found, but similar found
        else
          state.inexactTrackMatches.push({
            recordID: record._id.toString(),
            trackID: track._id.toString(),
            options: searchTrackResults,
          })
      }
    }
    state.requestsMade++
    res.write(
      "data: " +
        `${(state.requestsMade / state.requestsRequired).toFixed(2)}\n\n`
    )
  }
}

async function processMatchedTracks(
  user: IUser,
  state: ImportRecordState | ImportMatchedState
): Promise<void> {
  const retrievedFeatures: AudioFeatures[] = await getAudioFeatures(
    state.matchedTracks.map((i) => i.spotifyTrackID),
    user
  )
  if (!(await saveAudioFeatures(retrievedFeatures, state.matchedTracks, user)))
    throw new Error("One or more tracks not updated with Audio Features.")
}

function optimiseAlbumQuery(query: AlbumQuery): string {
  if (query.artist === "Various") return query.album
  let queryString = `${query.album} ${query.artist}`.replaceAll("  ", " ")
  if (queryString.length <= 100) return queryString
  queryString = queryString.replaceAll(/\(|\)/g, "").replaceAll("  ", " ")
  if (queryString.length <= 100) return queryString
  return queryString.slice(0, 100)
}

async function searchAlbum(
  query: AlbumQuery,
  user: IUser
): Promise<SpotifyAlbumEdit[]> {
  const inexactAlbumMatches: SpotifyAlbumEdit[] = []
  const params = new URLSearchParams()
  console.log(optimiseAlbumQuery(query))
  params.append("q", optimiseAlbumQuery(query))
  params.append("type", "album")
  params.append("limit", "50")
  const url = `${spotifyAPIURL}search?${params}`
  const response = await spotifyRequest(url, user)
  if (!isSearchAlbumResponse(response))
    throw new Error("Bad spotify response. (Search albums)")
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
  return inexactAlbumMatches.sort(sortLevenshtein).slice(0, 8)
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

async function searchTrack(
  query: TrackQuery,
  user: IUser
): Promise<SpotifyTrackEdit[]> {
  const queryArtist = query.artists[0].toLowerCase()
  const queryTrack = query.track.toLowerCase()
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
      const foundArtist = item.artists[0].name.toLowerCase()
      const foundTrack = item.name.toLowerCase()
      if (foundArtist === queryArtist && foundTrack === queryTrack)
        return [exactSpotifyTrack(item)]
      options.push(item.id)
    }
  }
  if (options.length) return await getTrackOptions(options, query, user)
  else return []
}

async function getAlbumTracks(
  record: IRecord,
  user: IUser,
  album: SpotifyAlbumEdit,
  state: ImportMatchedState | ImportRecordState
): Promise<void> {
  const params = new URLSearchParams()
  params.append("limit", "50")
  const url = `${spotifyAPIURL}albums/${album.id}/tracks?${params}`
  const response = await spotifyRequest(url, user)
  if (!isAlbumTracksResponse(response))
    throw new Error("Bad spotify response. (Album tracks)")
  const albumTracks = response.items
  if (albumTracks.length) {
    for (const track of record.tracks) {
      const matchedTrack = albumTracks.find(
        (i) => normaliseTitle(i.name) === normaliseTitle(track.title)
      )
      if (matchedTrack)
        state.matchedTracks.push({
          recordID: record._id.toString(),
          trackID: track._id.toString(),
          spotifyTrackID: matchedTrack.id,
        })
      else {
        const options = []
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
        state.inexactTrackMatches.push({
          recordID: record._id.toString(),
          trackID: track._id.toString(),
          options: options.sort(sortLevenshtein).slice(0, 4),
        })
      }
    }
  }
}

// gets the whole track options, as track search doesn't return image and release_date
async function getTrackOptions(
  options: string[],
  query: TrackQuery,
  user: IUser
): Promise<SpotifyTrackEdit[]> {
  const queryArtist = query.artists[0].toLowerCase()
  const queryTrack = query.track.toLowerCase()
  const url = `${spotifyAPIURL}tracks/?ids=${options.join(",")}`
  const response = await spotifyRequest(url, user)
  if (!isTracksResponse(response))
    throw new Error("Bad spotify response. (Tracks)")
  const tracks = response.tracks
  const optionsFull: SpotifyTrackEdit[] = []
  for (const track of tracks) {
    let distance
    const foundArtist = track.artists[0].name.toLowerCase()
    const foundTrack = track.name.toLowerCase()
    if (foundArtist === queryArtist)
      distance = levenshtein(foundTrack, queryTrack)
    else {
      const artistDistance = levenshtein(foundArtist, queryArtist)
      const trackDistance = levenshtein(foundTrack, queryTrack)
      distance = artistDistance + trackDistance
    }
    if (query.year) {
      const foundYear = new Date(track.album.release_date).getFullYear()
      distance = distance + unsign(query.year - foundYear)
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

async function getTracksFromMatchedAlbums(
  user: IUser,
  state: ImportMatchedState,
  res: ExpressResponse
): Promise<void> {
  for (const matchedAlbum of state.matchedAlbums) {
    const record = await Record.findById(matchedAlbum.recordID)
    if (!record) throw new Error("A Record couldnt be found.")
    await getAlbumTracks(record, user, matchedAlbum.album, state)
    state.requestsMade++
    res.write(
      "data: " +
        `${(state.requestsMade / state.requestsRequired).toFixed(2)}\n\n`
    )
  }
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

const normaliseTitle = (title: string) =>
  title.toLowerCase().trim().replace(/\(|\)/g, "").replace(/ - /, " ")

const normaliseArtist = (artist: string) => artist.toLowerCase().trim()

const sortLevenshtein = (
  a: SpotifyAlbumEdit | SpotifyTrackEdit,
  b: SpotifyAlbumEdit | SpotifyTrackEdit
): number => a.levenshtein - b.levenshtein

export { importRecordFeatures, importMatchedFeatures }
