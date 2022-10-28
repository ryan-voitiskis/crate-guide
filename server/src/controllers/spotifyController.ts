import asyncHandler from "express-async-handler"
import fetch from "node-fetch"
import levenshtein from "js-levenshtein"
import { ITrack, IRecord, Record } from "../models/recordModel.js"
import unsign from "../utils/unsign.js"
import { User } from "../models/userModel.js"

const spotifyAPIURL = "https://api.spotify.com/v1/"

const getOptions = (token: string) => {
  return {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
  }
}

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
  external_urls?: string
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

// @desc    removes discogs API creds from user
// @route   GET /api/spotify/track
// @access  private
const importRecordAudioFeatures = asyncHandler(async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream")
  res.write("data: " + `0\n\n`)

  const recordIDs: string[] = JSON.parse(req.body.records)
  const records = await Record.find({ _id: { $in: recordIDs } })
  const user = await User.findById(req.user!.id)

  if (user && records) {
    const imperfectMatches = []
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
          importAlbumTracks(record, searchAlbumResults[0].id, user.spotifyToken)
        }
        // if no perfect match found, but similar found
        else if (searchAlbumResults.length > 1)
          imperfectMatches.push({
            _id: record._id.toString(),
            matches: searchAlbumResults,
          })
      } else noMatches.push(record._id.toString())
      i++
      res.write("data: " + `${(i / records.length).toFixed(2)}\n\n`)
    }
    if (imperfectMatches.length || noMatches.length)
      res.write(
        "data: " +
          `json:${JSON.stringify({
            imperfectMatches: imperfectMatches,
            noMatches: noMatches,
          })}\n\n`
      )
    else res.write("data: " + `1\n\n`)
    res.end()
  }
})

const searchAlbum = async (
  query: AlbumQuery,
  token: string
): Promise<SearchAlbumResult[]> => {
  const params = new URLSearchParams()
  params.append("q", JSON.stringify(query))
  params.append("type", "album")
  params.append("limit", "50")
  const url = `${spotifyAPIURL}search?${params}`
  const response = await fetch(url, getOptions(token))
  const searchAlbumResponse = await response.json()
  const matches: SearchAlbumResult[] = []

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
          external_urls: item.external_urls.spotify,
          release_date: item.release_date,
        })
      }
    }
  }
  return matches.sort((a, b) => a.levenshtein - b.levenshtein).slice(0, 8)
}

const importAlbumTracks = async (
  record: IRecord,
  albumID: string,
  token: string
) => {
  const imperfectTrackMatches = []
  const matchedTracks = []
  const albumTracks = await getAlbumTracks(albumID, token)
  if (albumTracks.length) {
    for (const track of record.tracks) {
      const matchedTrack = albumTracks.find(
        (i) => normaliseTitle(i.name) === normaliseTitle(track.title)
      )
      if (matchedTrack)
        matchedTracks.push({ trackID: track._id, spotifyTrack: matchedTrack })
      else console.log("TODO: handle imperfect matches here")
    }
  }
  console.log(matchedTracks)
}

const getAlbumTracks = async (albumID: string, token: string) => {
  const params = new URLSearchParams()
  params.append("limit", "50")
  const url = `${spotifyAPIURL}albums/${albumID}/tracks`
  const response = await fetch(url, getOptions(token))
  const responseObj = (await response.json()) as AlbumTracksResponse
  return responseObj.items
}

const searchTrack = async (
  query: TrackQuery,
  token: string
): Promise<SearchTrackResult | null> => {
  const params = new URLSearchParams()
  params.append("q", JSON.stringify(query))
  params.append("type", "track")
  params.append("limit", "50")
  const url = `${spotifyAPIURL}search?${params}`
  const response = await fetch(url, getOptions(token))
  const SearchTrackResponse = await response.json()
  if (isSearchTrackResponse(SearchTrackResponse)) {
    if (SearchTrackResponse.tracks.items.length) {
      const queryArtist = query.artist.toLocaleLowerCase()
      const queryTrack = query.track.toLocaleLowerCase()
      for (const item of SearchTrackResponse.tracks.items) {
        const foundArtist = item.artists[0].name.toLocaleLowerCase()
        const foundTrack = item.name.toLocaleLowerCase()
        if (foundArtist === queryArtist) {
          if (foundTrack === queryTrack) {
            return { id: item.id, levenshtein: 0 }
          } else {
            const distance = levenshtein(foundTrack, queryTrack)
            console.log(distance + " - " + foundTrack + " | " + queryTrack)
            if (distance < 10) return { id: item.id, levenshtein: distance }
          }
        }
      }
    }
  }
  return null
}

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

//     const response = await fetch(url, getOptions(token))

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

export { importRecordAudioFeatures }
