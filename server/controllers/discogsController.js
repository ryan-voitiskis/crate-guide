import got from "got"
import asyncHandler from "express-async-handler"
import User from "../models/userModel.js"

const oauth_consumer_key = "WJSUzMPCQcGdEFidpwqn"
const oauth_consumer_secret = "oyasysRSKMwElyRpJjulWoxFBdaXDDTS%26"
const requestTokenURL = "https://api.discogs.com/oauth/request_token"
const authoriseURL = "https://www.discogs.com/oauth/authorize"
const accessTokenURL = "https://api.discogs.com/oauth/access_token"
const oauthCallback = "http://localhost:5001/api/discogs/capture_verifier"
const userAgent = "CrateGuide/0.2"

// 12 char nonce generator
const nonce = () => {
  let text = ""
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  for (let i = 0; i < 12; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length))
  }
  return text
}

// @desc    request OAuth token as per step 2 of:
// * https://www.discogs.com/developers/#page:authentication,header:authentication-oauth-flow
// @route   GET /api/discogs/request_token
// @access  Private
const requestToken = asyncHandler(async (req, res) => {
  const params = new URLSearchParams()
  params.append("oauth_consumer_key", oauth_consumer_key)
  params.append("oauth_nonce", nonce())
  params.append("oauth_version", "1.0")
  params.append("oauth_signature_method", "PLAINTEXT")
  params.append("oauth_timestamp", Date.now().toString())
  params.append("oauth_signature", oauth_consumer_secret)
  params.append("oauth_callback", oauthCallback)

  const options = {
    method: "GET",
    headers: {
      "User-Agent": userAgent,
    },
  }

  const response = await got(requestTokenURL + "?" + params, options)
  const responseParams = new URLSearchParams(response.body)
  const returnObject = Object.fromEntries([...responseParams])
  if (returnObject.hasOwnProperty("oauth_token")) {
    // update user with oauth_token
    await User.findByIdAndUpdate(
      req.user.id,
      { discogsToken: returnObject.oauth_token } // todo: update in user store on client
    )
    res.status(200).json(returnObject.oauth_token)
  } else {
    res.status(400)
    throw new Error("Discogs did not provide OAuth token.")
  }
})

const captureVerifier = asyncHandler(async (req, res) => {
  if (req.query.hasOwnProperty("oauth_token")) {
    // todo: step 4
  }
  res.status(200).json(req.query)
})

// @desc    todo
// @route   GET /api/discogs/access_token
// @access  Private
const accessToken = asyncHandler(async (req, res) => {})

export { captureVerifier, requestToken, accessToken }
