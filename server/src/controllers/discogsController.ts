import asyncHandler from "express-async-handler"
import env from "../env.js"
import fetch from "node-fetch"
import genNonce from "../utils/genNonce.js"
import oauthSignature from "oauth-signature"

const oauth_consumer_key = "WJSUzMPCQcGdEFidpwqn"
const oauth_consumer_secret = "oyasysRSKMwElyRpJjulWoxFBdaXDDTS"
const discogsAPIURL = "https://api.discogs.com/"
const userAgent = "CrateGuide/0.2"

interface Folder {
  id: number
  name: string
  count: number
  resource_url: string
}

interface foldersResponse {
  folders: Folder[]
}

function isFoldersResponse(obj: any): obj is foldersResponse {
  return "folders" in obj
}

// @desc    capture verifier and send req to access_token as per step 3 and 4 of:
// *        https://www.discogs.com/developers/#page:authentication,header:authentication-oauth-flow
// @route   GET /api/discogs/capture_verifier
// @access  public
const getFolders = asyncHandler(async (req, res) => {
  const httpMethod = "GET"
  const nonce = genNonce()
  const timestamp = Date.now().toString()
  const url = `${discogsAPIURL}users/${
    req.user!.discogsUsername
  }/collection/folders`

  const signatureParams = {
    oauth_consumer_key: oauth_consumer_key,
    oauth_token: req.user!.discogsToken,
    oauth_nonce: nonce,
    oauth_timestamp: timestamp,
    oauth_signature_method: "HMAC-SHA1",
    oauth_version: "1.0",
  }

  // generates a RFC 3986 encoded, BASE64 encoded HMAC-SHA1 hash
  const encodedSignature = oauthSignature.generate(
    httpMethod,
    url,
    signatureParams,
    oauth_consumer_secret,
    req.user!.discogsTokenSecret
  )

  const URLParams = new URLSearchParams()
  URLParams.append("oauth_consumer_key", oauth_consumer_key)
  URLParams.append("oauth_token", req.user!.discogsToken)
  URLParams.append("oauth_signature", encodedSignature)
  URLParams.append("oauth_signature_method", "HMAC-SHA1")
  URLParams.append("oauth_timestamp", timestamp)
  URLParams.append("oauth_nonce", nonce)
  URLParams.append("oauth_version", "1.0")

  const options = {
    method: "GET",
    headers: {
      "User-Agent": userAgent,
    },
  }

  console.log(url + "?" + URLParams)

  const response = await fetch(url + "?" + URLParams, options)
  const folders = await response.json()

  if (isFoldersResponse(folders)) {
    res.status(200).json(folders.folders)
  } else {
    res.status(400)
    throw new Error(`Discogs response did not contain 'folders'.`)
  }
})

export { getFolders }
