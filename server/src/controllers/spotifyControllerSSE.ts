import asyncHandler from "express-async-handler"
import levenshtein from "js-levenshtein"
import { IRecord, Record } from "../models/recordModel.js"
import { IUser } from "../models/userModel.js"
import { spotifyRequest, checkRefreshToken } from "./spotifyOAuthController.js"
import { Response as ExpressResponse } from "express"
import {
  searchAlbum,
  searchTrack,
  getAudioFeatures,
  saveAudioFeatures,
  normaliseTitle,
  sortLevenshtein,
} from "./spotifyControllerUtils.js"
import {
  SpotifyAlbumEdit,
  isAlbumTracksResponse,
  AudioFeatures,
  ImportRecordState,
  ImportMatchedState,
} from "../types/spotifyController-types.js"
const spotifyAPIURL = "https://api.spotify.com/v1/"

// @desc    finds and imports spotify data for provided records, sends back albums and tracks for matching
// @route   POST /api/spotify/import_selected
// @access  private
const importRecordFeatures = asyncHandler(async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("X-Accel-Buffering", "no") //! SSE won't work in production without this
  //*https://stackoverflow.com/questions/27898622/server-sent-events-stopped-work-after-enabling-ssl-on-proxy

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
  res.setHeader("X-Accel-Buffering", "no") //! SSE won't work in production without this
  //*https://stackoverflow.com/questions/27898622/server-sent-events-stopped-work-after-enabling-ssl-on-proxy

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

export { importRecordFeatures, importMatchedFeatures }
