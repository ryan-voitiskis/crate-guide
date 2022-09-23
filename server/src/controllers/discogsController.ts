import asyncHandler from "express-async-handler"
import User from "../models/userModel.js"
import fetch from "node-fetch"
import env from "../env.js"

const oauth_consumer_key = "WJSUzMPCQcGdEFidpwqn"
const oauth_consumer_secret = "oyasysRSKMwElyRpJjulWoxFBdaXDDTS%26"
const requestTokenURL = "https://api.discogs.com/oauth/request_token"
const authoriseURL = "https://www.discogs.com/oauth/authorize"
const accessTokenURL = "https://api.discogs.com/oauth/access_token"
const oauthCallback = env.SITE_URL + "/api/discogs/capture_verifier"
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
// *        https://www.discogs.com/developers/#page:authentication,header:authentication-oauth-flow
// @route   GET /api/discogs/request_token
// @access  private
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

  const response = await fetch(requestTokenURL + "?" + params, options)
  const responseParams = new URLSearchParams(await response.text())
  const returnObject = Object.fromEntries([...responseParams])

  if (returnObject.hasOwnProperty("oauth_token")) {
    // update user with oauth_token + oauth_token_secret
    await User.findByIdAndUpdate(req.user?.id, {
      discogsRequestToken: returnObject.oauth_token,
      discogsRequestTokenSecret: returnObject.oauth_token_secret,
    })

    // response is oauth_token required for step 3 of:
    // * https://www.discogs.com/developers/#page:authentication,header:authentication-oauth-flow
    res.status(200).json(returnObject.oauth_token)
  } else
    res.status(400).json({ message: "Discogs did not provide OAuth token" })
})

// @desc    capture verifier and send req to access_token as per step 3 and 4 of:
// *        https://www.discogs.com/developers/#page:authentication,header:authentication-oauth-flow
// @route   GET /api/discogs/capture_verifier
// @access  public
const captureVerifier = asyncHandler(async (req, res) => {
  if (
    req.query.hasOwnProperty("oauth_token") &&
    req.query.hasOwnProperty("oauth_verifier")
  ) {
    const user = await User.findOne({
      discogsRequestToken: req.query.oauth_token,
    })
    if (user?.discogsRequestTokenSecret) {
      const params = new URLSearchParams()
      params.append("oauth_consumer_key", oauth_consumer_key)
      params.append("oauth_nonce", nonce())
      params.append(
        "oauth_token",
        typeof req.query.oauth_token === "string" ? req.query.oauth_token : ""
      )
      params.append(
        "oauth_signature",
        oauth_consumer_secret + user.discogsRequestTokenSecret
      )
      params.append("oauth_signature_method", "PLAINTEXT")
      params.append("oauth_timestamp", Date.now().toString())
      params.append(
        "oauth_verifier",
        typeof req.query.oauth_verifier === "string"
          ? req.query.oauth_verifier
          : ""
      )

      const options = {
        method: "POST",
        headers: {
          "User-Agent": userAgent,
        },
      }

      // make post request as per step 4 (see link in fn desc)
      const response = await fetch(accessTokenURL + "?" + params, options)
      const responseParams = new URLSearchParams(await response.text())
      const returnObject = Object.fromEntries([...responseParams])

      // update user with forever token and secret
      await User.findByIdAndUpdate(user._id, {
        discogsToken: returnObject.oauth_token,
        discogsTokenSecret: returnObject.oauth_token_secret,
      })
      res.redirect(env.SITE_URL ?? "")
    } else
      res
        .status(400)
        .json({ message: "Found user doesn't have request token secret" }) // ? is this necessary?
  } else
    res
      .status(400)
      .json({ message: "Discogs request was missing token or verifier" })
})

export { captureVerifier, requestToken }
