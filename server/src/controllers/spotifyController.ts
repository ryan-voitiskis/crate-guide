import asyncHandler from "express-async-handler"
import fetch from "node-fetch"
import levenshtein from "js-levenshtein"
import { ITrack, IRecord, Record } from "../models/recordModel.js"
import unsign from "../utils/unsign.js"
import { IUser } from "../models/userModel.js"
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

const isAudioFeaturesResponse = (obj: any): obj is AudioFeaturesResponse => {
  return "audio_features" in obj
}

interface UnmatchedTrack {
  recordID: string
  trackID: string
}

interface ImportRecordState {
  matchedTracks: MatchedTrack[]
  inexactTrackMatches: InexactTrackMatches[]
  inexactAlbumMatches: InexactAlbumMatches[]
  unfoundAlbums: string[]
}

interface ImportMatchedState {
  matchedAlbums: MatchedAlbum[]
  matchedTracks: MatchedTrack[]
  unmatchedAlbums: string[]
  unmatchedTracks: UnmatchedTrack[]
  inexactTrackMatches: InexactTrackMatches[]
  unfoundTracks: UnmatchedTrack[] // ? possibly rename interface to TrackIDs or something
}

// @desc    todo
// @route   POST /api/spotify/import_data_for_selected
// @access  private
const importRecordFeatures = asyncHandler(async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream")
  const user = req.user! as IUser
  const recordIDs: string[] = JSON.parse(req.body.records)
  const records = await Record.find({ _id: { $in: recordIDs } })
  if (!records) throw new Error("No records found.")
  let i = 1
  const state: ImportRecordState = {
    matchedTracks: [],
    inexactTrackMatches: [],
    inexactAlbumMatches: [],
    unfoundAlbums: [],
  }

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
        await getAlbumTracks(record, user, searchAlbumResults[0], state)
      }
      // if no perfect match found, but similar found
      else
        state.inexactAlbumMatches.push({
          recordID: record._id.toString(),
          matches: searchAlbumResults,
        })
    } else state.unfoundAlbums.push(record._id.toString())
    res.write("data: " + `${(i++ / records.length).toFixed(2)}\n\n`)
  }

  // todo: match tracks from nomatches, possibly processUnmatchedAlbums

  const retrievedFeatures: AudioFeatures[] = await getAudioFeatures(
    state.matchedTracks.map((i) => i.spotifyTrackID),
    user
  )

  if (!(await saveAudioFeatures(retrievedFeatures, state.matchedTracks, user)))
    throw new Error("One or more tracks not updated with Audio Features.")

  if (
    state.inexactAlbumMatches.length ||
    state.unfoundAlbums.length ||
    state.inexactTrackMatches.length
  )
    res.write(
      "data: " +
        `json:${JSON.stringify({
          inexactAlbumMatches: state.inexactAlbumMatches,
          inexactTrackMatches: state.inexactTrackMatches,
          unfoundAlbums: state.unfoundAlbums,
        })}\n\n`
    )
  else res.write("data: " + `1\n\n`)
  res.end()
})

// @desc    todo
// @route   POST /api/spotify/import_data_for_client_matched
// @access  private
const importMatchedFeatures = asyncHandler(async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream")
  const user = req.user! as IUser
  const state: ImportMatchedState = {
    matchedAlbums: JSON.parse(req.body.matchedAlbums),
    matchedTracks: JSON.parse(req.body.matchedTracks),
    unmatchedAlbums: JSON.parse(req.body.unmatchedAlbums),
    unmatchedTracks: JSON.parse(req.body.unmatchedTracks),
    inexactTrackMatches: [],
    unfoundTracks: [],
  }

  await processUnmatchedAlbums(user, state)
  await processUnmatchedTracks(user, state)

  for (const matchedAlbum of state.matchedAlbums) {
    const record = await Record.findById(matchedAlbum.recordID)
    if (!record) throw new Error("A Record couldnt be found.")
    await getAlbumTracks(record, user, matchedAlbum.album, state)
  }

  // get audio features of matched tracks
  const retrievedFeatures: AudioFeatures[] = await getAudioFeatures(
    state.matchedTracks.map((i) => i.spotifyTrackID),
    user
  )

  // save audio features of matched tracks
  if (!(await saveAudioFeatures(retrievedFeatures, state.matchedTracks, user)))
    throw new Error("One or more tracks not updated with Audio Features.")

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
    await refreshToken(user.spotifyToken)
    throw new Error("Bad token") // front end will retry upon receiving this
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
  return inexactAlbumMatches.sort(sortLevenshtein).slice(0, 8)
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
  const queryArtist = query.artist.toLocaleLowerCase()
  const queryTrack = query.track.toLocaleLowerCase()
  const options: string[] = []
  const params = new URLSearchParams()
  params.append("q", JSON.stringify(query))
  params.append("type", "track")
  params.append("limit", "50")
  const url = `${spotifyAPIURL}search?${params}`
  const response = await spotifyRequest(url, user)
  if (!isSearchTrackResponse(response)) throw new Error("Bad spotify response.")
  if (response.tracks.items.length) {
    for (const item of response.tracks.items) {
      const foundArtist = item.artists[0].name.toLocaleLowerCase()
      const foundTrack = item.name.toLocaleLowerCase()
      if (foundArtist === queryArtist && foundTrack === queryTrack)
        return [exactSpotifyTrack(item)]
      options.push(item.id)
    }
  }
  return await getTrackOptions(options, query, user)
}

// no data other than id is required
const exactSpotifyTrack = (item: SearchTrackItem): SpotifyTrackEdit => {
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

// const editSpotifyTrack = (
//   item: SearchTrackItem,
//   distance: number
// ): SpotifyTrackEdit => {
//   return {
//     id: item.id,
//     name: item.name,
//     artists: item.artists.map((i) => i.name).join(", "),
//     external_url: item.external_urls.spotify,
//     release_date: "",
//     levenshtein: distance,
//     image: "",
//   }
// }

const getAlbumTracks = async (
  record: IRecord,
  user: IUser,
  album: SpotifyAlbumEdit,
  state: ImportMatchedState | ImportRecordState // * has side effects on state
): Promise<void> => {
  const params = new URLSearchParams()
  params.append("limit", "50") // ? is this getting used
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
        state.matchedTracks.push({
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
        state.inexactTrackMatches.push({
          recordID: record._id.toString(),
          trackID: track._id.toString(),
          options: options.sort(sortLevenshtein).slice(0, 4),
        })
      }
    }
  }
}

// gets the whole track options, as track search doesnt return image and release_date
// convoluted as no more than one spotifyRequest per set of options was desired
const getTrackOptions = async (
  options: string[],
  query: TrackQuery,
  user: IUser
): Promise<SpotifyTrackEdit[]> => {
  const queryArtist = query.artist.toLocaleLowerCase()
  const queryTrack = query.track.toLocaleLowerCase()
  const url = `${spotifyAPIURL}tracks/?ids=${options.join(",")}`
  const response = await spotifyRequest(url, user)
  if (!isTracksResponse(response)) throw new Error("Bad spotify response.")
  const tracks = response.tracks
  const optionsFull: SpotifyTrackEdit[] = []
  for (const track of tracks) {
    let distance
    const foundArtist = track.artists[0].name.toLocaleLowerCase()
    const foundTrack = track.name.toLocaleLowerCase()
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
    const image640 = track.album.images.find((i) => (i.height = 640))
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

const processUnmatchedAlbums = async (
  user: IUser,
  state: ImportMatchedState // * has side effects on state
): Promise<void> => {
  for (const unmatchedAlbum of state.unmatchedAlbums) {
    const record = await Record.findOne({
      user: user._id,
      _id: unmatchedAlbum,
    })
    if (!record) throw new Error("Couldn't find record of an unmatched track.")
    for (const track of record.tracks) {
      const query = {
        artist: track.artists
          ? track.artists.split(",")[0]
          : record.artists.split(",")[0],
        track: track.title,
        year: record.year, // should year be included in this query and others?
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
      } else
        state.unfoundTracks.push({
          recordID: record._id.toString(),
          trackID: track._id.toString(),
        })
    }
  }
}

const processUnmatchedTracks = async (
  user: IUser,
  state: ImportMatchedState // * has side effects on state
): Promise<void> => {
  for (const unmatchedTrack of state.unmatchedTracks) {
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
    } else
      state.unfoundTracks.push({
        recordID: record._id.toString(),
        trackID: track._id.toString(),
      })
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
  tracks: MatchedTrack[],
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

const sortLevenshtein = (
  a: SpotifyAlbumEdit | SpotifyTrackEdit,
  b: SpotifyAlbumEdit | SpotifyTrackEdit
): number => a.levenshtein - b.levenshtein

export { importRecordFeatures, importMatchedFeatures }
