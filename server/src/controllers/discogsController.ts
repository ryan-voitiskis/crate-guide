import asyncHandler from "express-async-handler"
import fetch from "node-fetch"
import genNonce from "../utils/genNonce.js"
import oauthSignature from "oauth-signature"
import Record from "../models/recordModel.js"
import { IUser } from "../models/userModel.js"

const oauth_consumer_key = "WJSUzMPCQcGdEFidpwqn"
const oauth_consumer_secret = "oyasysRSKMwElyRpJjulWoxFBdaXDDTS"
const discogsAPIURL = "https://api.discogs.com/"
const userAgent = "CrateGuide/0.2"

// only properties needed for crate-guide included in interfaces

interface Folder {
  id: number
  name: string
  count: number
  resource_url: string
}

interface FoldersResponse {
  folders: Folder[]
}

function isFoldersResponse(obj: any): obj is FoldersResponse {
  return "folders" in obj
}

interface Format {
  name: string
  qty: number
  descriptions: string[]
}

interface Label {
  id: number
  name: string
  catno: string
  entity_type: string
  resource_url: string
}

interface Artist {
  id: number
  name: string
  join: string
  resource_url: string
  anv: string
  tracks: string
  role: string
}

interface Image {
  height: number
  width: number
  resource_url: string
  type: string
}

interface Track {
  duration: string
  position: string
  artists?: Artist[]
  title: string
  type_: string
}

interface Release {
  id: number
  basic_information: {
    id: number
    title: string
    year: number
    thumb: string
    cover_image: string
    formats: Format[]
    labels: Label[]
    artists: Artist[]
    genre: string[]
    styles: string[]
  }
}

interface FolderResponse {
  pagination: {
    page: number
    pages: number
    per_page: number
    items: number
  }
  releases: Release[]
}

interface ReleaseFull {
  id: number
  title: string
  formats: Format[]
  labels: Label[]
  artists: Artist[]
  images: Image[]
  tracklist: Track[]
  genre?: string[]
  styles?: string[]
  year: number
}

const authorisedDiscogsRequest = async (
  url: string,
  user: IUser,
  page?: number,
  per_page?: number
) => {
  const httpMethod = "GET" // hardcoded as no plans to provide POST or other functionality
  const nonce = genNonce()
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

// @desc    get a list of users discogs folders
// @route   GET /api/discogs/folders
// @access  private
const getFolders = asyncHandler(async (req, res) => {
  const url = `${discogsAPIURL}users/${
    req.user!.discogsUsername
  }/collection/folders`

  const response = await authorisedDiscogsRequest(url, req.user! as IUser)
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

  let response = await authorisedDiscogsRequest(url, user, 1, perPage)

  if (response.status === 200) {
    let folderResponse = (await response.json()) as FolderResponse
    let releases: Release[] = folderResponse.releases

    // if more than 100 releases in folder, make consecutive paginated requests
    while (folderResponse.pagination.page < folderResponse.pagination.pages) {
      const page = folderResponse.pagination.page + 1
      response = await authorisedDiscogsRequest(url, user, page, perPage)
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

// @desc    add records - used for importing records from discogs
// @route   POST /api/records
// @access  private
const importRecords = asyncHandler(async (req, res) => {
  const recordIDs: number[] = JSON.parse(req.body.records)
  const urlBase = `${discogsAPIURL}releases/`
  const user = req.user! as IUser
  const records: ReleaseFull[] = []
  let requestsMade = 0

  // TODO: handle rate limiting for n>60, and handle 429 and 404
  while (requestsMade < recordIDs.length) {
    const url = urlBase + recordIDs[requestsMade].toString()
    const response = await authorisedDiscogsRequest(url, user)
    // console.log(response.headers)
    const retrievedRecord = (await response.json()) as ReleaseFull
    records.push(retrievedRecord)
    requestsMade++
  }

  const editedReleases = records.map((i) => ({
    user: req.user!.id,
    discogsID: i.id,
    catno: i.labels[0].catno,
    title: i.title,
    label: i.labels[0].name,
    artists: i.artists.map((i) => i.name).toString(),
    year: i.year,
    cover:
      i.images.find((j) => j.type === "primary")?.resource_url ||
      i.images[0].resource_url,
    tracks: i.tracklist.map((j) => ({
      title: j.title,
      artists: j.artists ? j.artists.map((k) => k.name).toString() : "",
      position: j.position,
      duration: j.duration,
      genre: i.styles ? i.styles.toString() : "",
      rpm: i.formats[0].descriptions?.toString().includes("45") ? "45" : "33",
      playable: true,
    })),
  }))

  // ? will this ever occur?
  editedReleases.forEach((record: any) => {
    if (!record.title || !record.artists) {
      res.status(400)
      throw new Error("One or more records are missing 'Title' or 'Artists'.")
    }
  })

  const createdRecords = await Record.insertMany(editedReleases)
  res.status(201).json(createdRecords)
})

export { getFolders, getFolder, importRecords }
