import asyncHandler from "express-async-handler"
import fetch from "node-fetch"
import levenshtein from "js-levenshtein"
import { ITrack, IRecord, Record } from "../models/recordModel.js"
import { User } from "../models/userModel.js"

const spotifyAPIURL = "https://api.spotify.com/v1/"

interface Image {
  url: string
}
interface SearchAlbumArtist {
  name: string
}

interface SearchAlbumItem {
  artists: SearchAlbumArtist[]
  id: string
  name: string
  images: Image[]
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
    for await (const record of records) {
      const query = {
        artist: record.artists.split(",")[0],
        album: record.title,
        year: record.year,
      }
      const searchAlbumResults = await searchAlbum(query, user.spotifyToken)
      // if perfect match found
      if (searchAlbumResults[0].levenshtein === 0) {
        // todo: try without await
        await Record.findByIdAndUpdate(record._id, {
          spotifyID: searchAlbumResults[0].id,
        })
        // if no perfect match found, but similar found
      } else if (searchAlbumResults.length > 1) {
        imperfectMatches.push({
          _id: record._id,
          matches: searchAlbumResults,
        })
      }
    }
    if (imperfectMatches.length)
      res.write("data: " + `json:${JSON.stringify(imperfectMatches)}\n\n`)
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
  const options = {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
  }
  const url = `${spotifyAPIURL}search?${params}`
  const response = await fetch(url, options)
  const searchAlbumResponse = await response.json()
  const matches: SearchAlbumResult[] = []

  if (isSearchAlbumResponse(searchAlbumResponse)) {
    if (searchAlbumResponse.albums.items.length) {
      const queryArtist = query.artist.toLocaleLowerCase()
      const queryAlbum = query.album.toLocaleLowerCase()
      for (const item of searchAlbumResponse.albums.items) {
        const foundArtist = item.artists[0].name.toLocaleLowerCase()
        const foundAlbum = item.name.toLocaleLowerCase()
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
  return matches.sort((a, b) => a.levenshtein - b.levenshtein).slice(0, 4)
}

// const searchTrack = async (
//   query: TrackQuery,
//   token: string
// ): Promise<SearchTrackResult | null> => {
//   const params = new URLSearchParams()
//   params.append("q", JSON.stringify(query))
//   params.append("type", "track")
//   params.append("limit", "50")
//   const options = {
//     method: "GET",
//     headers: {
//       Accept: "application/json",
//       "Content-Type": "application/x-www-form-urlencoded",
//       Authorization: `Bearer ${token}`,
//     },
//   }
//   const url = `${spotifyAPIURL}search?${params}`
//   const response = await fetch(url, options)
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
//     const options = {
//       method: "GET",
//       headers: {
//         Accept: "application/json",
//         "Content-Type": "application/x-www-form-urlencoded",
//         Authorization: `Bearer ${user.spotifyToken}`,
//       },
//     }
//     const url = `${spotifyAPIURL}search?${params}`

//     const response = await fetch(url, options)

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
