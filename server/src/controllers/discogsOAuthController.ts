import asyncHandler from "express-async-handler"
import User from "../models/userModel.js"
import fetch from "node-fetch"
import env from "../env.js"
import oauthSignature from "oauth-signature"

const oauth_consumer_key = "WJSUzMPCQcGdEFidpwqn"
const oauth_consumer_secret = "oyasysRSKMwElyRpJjulWoxFBdaXDDTS"
const requestTokenURL = "https://api.discogs.com/oauth/request_token"
const accessTokenURL = "https://api.discogs.com/oauth/access_token"
const identityURL = "https://api.discogs.com/oauth/identity"
const oauthCallback = env.SITE_URL + "/api/discogs/capture_verifier"
const userAgent = "CrateGuide/0.2"

interface accessTokenResponse {
  oauth_token: string
  oauth_token_secret: string
}

function isAccessTokenResponse(obj: any): obj is accessTokenResponse {
  return (
    typeof obj.oauth_token === "string" &&
    typeof obj.oauth_token_secret === "string"
  )
}

interface identityResponse {
  id: number
  username: string
  resource_url: string
  consumer_name: string
}

function isIdentityResponse(obj: any): obj is identityResponse {
  return (
    typeof obj.id === "number" &&
    typeof obj.username === "string" &&
    typeof obj.resource_url === "string" &&
    typeof obj.consumer_name === "string"
  )
}

interface captureVerifierQuery {
  oauth_token: string
  oauth_verifier: string
}

function isCaptureVerifierQuery(obj: any): obj is captureVerifierQuery {
  return (
    typeof obj.oauth_token === "string" &&
    typeof obj.oauth_verifier === "string"
  )
}

// 12 char nonce generator
const genNonce = (): string => {
  let text = ""
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  for (let i = 0; i < 12; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length))
  }
  return text
}

// @desc    request OAuth token as per step 2 of:
// *        https://www.discogs.com/developers/#page:authentication,header:authentication-oauth-flow
// @route   GET /api/discogs/request_token
// @access  private
const requestTokenAndUpdateUser = asyncHandler(async (req, res) => {
  const params = new URLSearchParams()
  params.append("oauth_consumer_key", oauth_consumer_key)
  params.append("oauth_nonce", genNonce())
  params.append("oauth_version", "1.0")
  params.append("oauth_signature_method", "PLAINTEXT")
  params.append("oauth_timestamp", Date.now().toString())
  params.append("oauth_signature", oauth_consumer_secret + "%26")
  params.append("oauth_callback", oauthCallback)

  const options = {
    method: "GET",
    headers: {
      "User-Agent": userAgent,
    },
  }

  const response = await fetch(requestTokenURL + "?" + params, options)
  const responseParams = new URLSearchParams(await response.text())
  const returnObject = Object.fromEntries([...responseParams])

  if (returnObject.hasOwnProperty("oauth_token")) {
    // update user with oauth_token + oauth_token_secret
    await User.findByIdAndUpdate(req.user!.id, {
      discogsRequestToken: returnObject.oauth_token,
      discogsRequestTokenSecret: returnObject.oauth_token_secret,
    })

    // response object is oauth_token required for step 3 of:
    // * https://www.discogs.com/developers/#page:authentication,header:authentication-oauth-flow
    res.status(200).json(returnObject.oauth_token)
  } else {
    res.status(400)
    throw new Error("Discogs did not provide OAuth token.")
  }
})

// @desc    capture verifier and send req to access_token as per step 3 and 4 of:
// *        https://www.discogs.com/developers/#page:authentication,header:authentication-oauth-flow
// @route   GET /api/discogs/capture_verifier
// @access  public
const captureVerifierAndUpdateUser = asyncHandler(async (req, res) => {
  if (isCaptureVerifierQuery(req.query)) {
    const query: captureVerifierQuery = req.query
    const user = await User.findOne({
      discogsRequestToken: query.oauth_token,
    })
    if (user?.discogsRequestTokenSecret) {
      const OAuthCredentials = await getOAuthCredentials(
        query,
        user.discogsRequestTokenSecret
      )
      if (isAccessTokenResponse(OAuthCredentials)) {
        const discogsUsername = await getDiscogsUsername(OAuthCredentials)
        if (discogsUsername) {
          await User.findByIdAndUpdate(user._id, {
            discogsUsername: discogsUsername,
            discogsToken: OAuthCredentials.oauth_token, // forever token
            discogsTokenSecret: OAuthCredentials.oauth_token_secret, // forever token secret
            discogsRequestToken: "", // only used for OAuth flow
            discogsRequestTokenSecret: "", // only used for OAuth flow
            justCompleteDiscogsOAuth: true, // flag for front-end success modal
          })
        } else {
          res.status(400)
          throw new Error(`${identityURL} didn't respond with username.`)
        }
      } else {
        res.status(400)
        throw new Error(`${accessTokenURL} didn't respond with token & secret.`)
      }
      res.redirect(env.SITE_URL ?? "")
    } else {
      res.status(400)
      throw new Error("Found user doesn't have request token secret.")
    }
  } else {
    res.status(400)
    throw new Error("Discogs request was missing token or verifier.")
  }
})

// make post request as per step 4 of
// * https://www.discogs.com/developers/#page:authentication,header:authentication-oauth-flow
const getOAuthCredentials = async (
  query: captureVerifierQuery,
  tokenSecret: string
) => {
  const params = new URLSearchParams()
  params.append("oauth_consumer_key", oauth_consumer_key)
  params.append("oauth_nonce", genNonce())
  params.append("oauth_token", query.oauth_token)
  params.append("oauth_signature", `${oauth_consumer_secret}%26${tokenSecret}`)
  params.append("oauth_signature_method", "PLAINTEXT")
  params.append("oauth_timestamp", Date.now().toString())
  params.append("oauth_verifier", query.oauth_verifier)

  const options = {
    method: "POST",
    headers: {
      "User-Agent": userAgent,
    },
  }

  const response = await fetch(accessTokenURL + "?" + params, options)
  const responseParams = new URLSearchParams(await response.text())
  const credentials = Object.fromEntries([...responseParams])
  return credentials
}

// send authenticated request to retrieve users discogs identity as per step 5 of
// * https://www.discogs.com/developers/#page:authentication,header:authentication-oauth-flow
const getDiscogsUsername = async (oauthCreds: accessTokenResponse) => {
  const httpMethod = "GET"
  const nonce = genNonce()
  const timestamp = Date.now().toString()

  const signatureParams = {
    oauth_consumer_key: oauth_consumer_key,
    oauth_token: oauthCreds.oauth_token,
    oauth_nonce: nonce,
    oauth_timestamp: timestamp,
    oauth_signature_method: "HMAC-SHA1",
    oauth_version: "1.0",
  }

  // generates a RFC 3986 encoded, BASE64 encoded HMAC-SHA1 hash
  const encodedSignature = oauthSignature.generate(
    httpMethod,
    identityURL,
    signatureParams,
    oauth_consumer_secret,
    oauthCreds.oauth_token_secret
  )

  const URLParams = new URLSearchParams()
  URLParams.append("oauth_consumer_key", oauth_consumer_key)
  URLParams.append("oauth_token", oauthCreds.oauth_token)
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

  const response = await fetch(identityURL + "?" + URLParams, options)
  const identity = await response.json()
  return isIdentityResponse(identity) ? identity.username : ""
}

// @desc    removes discogs API creds from user
// @route   PUT /api/users/revoke_discogs/:id
// @access  private
const revokeDiscogsAuthorisation = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id)

  if (!user) {
    res.status(400)
    throw new Error("User not found.")
  }

  if (user!._id.valueOf() !== req.user!.id) {
    res.status(401)
    throw new Error("User not authorised.")
  }

  await User.findByIdAndUpdate(req.params.id, {
    discogsUsername: "",
    discogsToken: "",
    discogsTokenSecret: "",
    discogsRequestToken: "",
    discogsRequestTokenSecret: "",
  })
  res.status(200).json()
})

export {
  captureVerifierAndUpdateUser,
  requestTokenAndUpdateUser,
  revokeDiscogsAuthorisation,
}
