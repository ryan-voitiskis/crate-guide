import asyncHandler from "express-async-handler"
import fetch from "node-fetch"
import genNonce from "../utils/genNonce.js"
import oauthSignature from "oauth-signature"
import { getDurationMs } from "../utils/durationFunctions.js"
import { Record } from "../models/recordModel.js"
import { IUser } from "../models/userModel.js"
import {
  isFoldersResponse,
  Release,
  FolderResponse,
  ReleaseFull,
  ExtraArtist,
} from "../types/discogsController-types.js"

const oauth_consumer_key = process.env.DISCOGS_CONSUMER_KEY as string
const oauth_consumer_secret = process.env.DISCOGS_CONSUMER_SECRET as string
const discogsAPIURL = "https://api.discogs.com/"
const userAgent = "CrateGuide/0.2"
const positionRx = /^[A-Z]\d{1,2}$/
const positionRx2 = /^[A-Z]{1,20}$/ // some discogs position in format "AA", "AAA" etc.
const titleSuffixableRoles = [
  "mix",
  "remix",
  "re-mix",
  "re-edit",
  "edit",
  "dub",
  "version",
]

// @desc    get a list of users discogs folders
// @route   GET /api/discogs/folders
// @access  private
const getFolders = asyncHandler(async (req, res) => {
  const url = `${discogsAPIURL}users/${
    req.user!.discogsUsername
  }/collection/folders`

  const response = await authenticatedDiscogsRequest(url, req.user! as IUser)
  const folders = await response.json()

  if (isFoldersResponse(folders)) {
    const editedFolders = folders.folders.map((i) => ({
      id: i.id,
      name: i.name,
      count: i.count,
    }))
    res.status(200).json(editedFolders)
  } else {
    res.status(400)
    throw new Error(`Discogs response did not contain folders.`)
  }
})

// @desc    get a folder of records from discogs
// @route   GET /api/discogs/folder/:id
// @access  private
const getFolder = asyncHandler(async (req, res) => {
  const perPage = 100 // 100 is maximum number per page for discogs API
  const url = `${discogsAPIURL}users/${
    req.user!.discogsUsername
  }/collection/folders/${req.params.id}/releases`
  const user = req.user! as IUser

  let response = await authenticatedDiscogsRequest(url, user, 1, perPage)

  if (response.status === 200) {
    let folderResponse = (await response.json()) as FolderResponse
    let releases: Release[] = folderResponse.releases

    // if more than 100 releases in folder, make consecutive paginated requests
    while (folderResponse.pagination.page < folderResponse.pagination.pages) {
      const page = folderResponse.pagination.page + 1
      response = await authenticatedDiscogsRequest(url, user, page, perPage)
      folderResponse = (await response.json()) as FolderResponse
      releases = releases.concat(folderResponse.releases)
    }
    const editedReleases = releases.map((i) => ({
      id: i.id,
      catno: i.basic_information.labels[0].catno,
      title: i.basic_information.title,
      label: i.basic_information.labels[0].name,
      artists: i.basic_information.artists.map((i) => i.name).toString(),
      year: i.basic_information.year,
      cover: i.basic_information.cover_image,
    }))
    res.status(200).json(editedReleases)
  } else {
    res.status(400)
    throw new Error(`Discogs didn't respond with folder.`)
  }
})

// @desc    imports edited ReleaseFull for an array of recordIDs, writes to client the progress of the import using SSE
// @route   POST /api/records
// @access  private
const importRecords = asyncHandler(async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream")
  res.write("data: " + `0\n\n`)

  const recordIDs: number[] = JSON.parse(req.body.records)
  const endpoint = `${discogsAPIURL}releases/`
  const user = req.user! as IUser
  const records: ReleaseFull[] = []
  const throttlePoint = 10 // X-Discogs-Ratelimit-Remaining to begin throttling
  let successfulRequests = 0
  let limitRemaining = 60
  let wait = 0

  while (successfulRequests < recordIDs.length) {
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait))
    const url = endpoint + recordIDs[successfulRequests].toString()
    const response = await authenticatedDiscogsRequest(url, user)

    if (response.status === 200) {
      successfulRequests++
      const retrievedRecord = (await response.json()) as ReleaseFull
      records.push(retrievedRecord)
      res.write(
        "data: " + `${(successfulRequests / recordIDs.length).toFixed(2)}\n\n`
      )
      limitRemaining = parseInt(
        response.headers.get("X-Discogs-Ratelimit-Remaining") || "0"
      )
      wait =
        limitRemaining < throttlePoint
          ? (throttlePoint - limitRemaining) * 1000
          : 0
    } else if (response.status === 429) {
      wait = wait + 10000
    } else if (response.status === 404) {
      res.write("data: " + `Error: A release was not found by Discogs.\n\n`)
      res.end()
    } else {
      res.write("data: " + `Error: Unexpected error.\n\n`)
      res.end()
    }
  }

  await Record.insertMany(editReleases(records, req.user!.id))
  res.write("data: " + `1\n\n`)
  res.end()
})

async function authenticatedDiscogsRequest(
  url: string,
  user: IUser,
  page?: number,
  per_page?: number
) {
  const httpMethod = "GET" // hardcoded as no plans to provide POST or other functionality
  const nonce = genNonce(12)
  const timestamp = Date.now().toString()

  let signatureParams = {
    oauth_consumer_key: oauth_consumer_key,
    oauth_token: user.discogsToken,
    oauth_nonce: nonce,
    oauth_timestamp: timestamp,
    oauth_signature_method: "HMAC-SHA1",
    oauth_version: "1.0",
  }
  if (page && per_page) {
    const paginationParams = { page: page, per_page: per_page }
    signatureParams = Object.assign(signatureParams, paginationParams)
  }

  // generates a RFC 3986 encoded, BASE64 encoded HMAC-SHA1 hash
  const encodedSignature = oauthSignature.generate(
    httpMethod,
    url,
    signatureParams,
    oauth_consumer_secret,
    user.discogsTokenSecret
  )

  const URLParams = new URLSearchParams()
  URLParams.append("oauth_consumer_key", oauth_consumer_key)
  URLParams.append("oauth_token", user.discogsToken)
  URLParams.append("oauth_signature", encodedSignature)
  URLParams.append("oauth_signature_method", "HMAC-SHA1")
  URLParams.append("oauth_timestamp", timestamp)
  URLParams.append("oauth_nonce", nonce)
  URLParams.append("oauth_version", "1.0")
  if (page && per_page) {
    URLParams.append("page", page.toString())
    URLParams.append("per_page", per_page.toString())
  }

  const options = {
    method: "GET",
    headers: {
      "User-Agent": userAgent,
    },
  }

  return await fetch(url + "?" + URLParams, options)
}

function editReleases(records: ReleaseFull[], userID: string) {
  return records.map((i) => ({
    user: userID,
    discogsID: i.id,
    catno: i.labels[0].catno.trim(),
    title: i.title.trim(),
    label: i.labels[0].name.trim().replace(/ \(\d{1,3}\)$/, ""),
    artists: i.artists
      .map((i) => i.name.trim().replace(/ \(\d{1,3}\)$/, ""))
      .join(", "),
    year: i.year,
    cover:
      i.images.find((j) => j.type === "primary")?.resource_url ||
      i.images[0].resource_url,
    tracks: i.tracklist.map((j) => {
      const extraArtists: ExtraArtist[] = j.extraartists ? j.extraartists : []
      const extraArtistsSuffixable = extraArtists.find((k) =>
        titleSuffixableRoles.includes(k.role.toLowerCase())
      )
      const title =
        extraArtistsSuffixable && j.title.trim().slice(-1) !== ")"
          ? `${j.title.trim()} (${normaliseArtist(
              extraArtistsSuffixable.name
            )} ${extraArtistsSuffixable.role})`
          : j.title.trim()
      const artists: string[] = j.artists
        ? j.artists.map((k) => normaliseArtist(k.name))
        : []
      const allArtists: string[] = extraArtists
        ? artists.concat(extraArtists.map((k) => normaliseArtist(k.name)))
        : artists
      return {
        title: title,
        artists: allArtists.join(", "),
        position: positionRx.test(j.position)
          ? j.position
          : positionRx2.test(j.position)
          ? j.position[0] + j.position.length.toString()
          : "",
        duration: getDurationMs(j.duration.trim()),
        genre: i.styles ? i.styles.join(", ") : "",
        rpm: i.formats[0].descriptions?.toString().includes("45") ? "45" : "33",
        playable: true,
      }
    }),
  }))
}

const normaliseArtist = (artist: string): string =>
  artist.trim().replace(/ \(\d{1,3}\)$/, "")

export { getFolders, getFolder, importRecords }
