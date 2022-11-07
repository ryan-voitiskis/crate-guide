// OAuth flow as per:
// * https://developer.spotify.com/documentation/general/guides/authorization/code-flow/
import asyncHandler from "express-async-handler"
import env from "../env.js"
import fetch from "node-fetch"
import genNonce from "../utils/genNonce.js"
import { User, IUser } from "../models/userModel.js"
import {
  isAccessTokenResponse,
  isRefreshTokenResponse,
} from "../types/spotifyOAuthController-types.js"

const clientID = "72f1c76a0d384bd6bd667a72afe04b84"
const clientSecret = "58bc4f20244b47b7887def2674c19052"
const redirectURI = "http://localhost:5001/api/spotify/callback"
const scope = "playlist-read-private playlist-read-collaborative"
const authoriseURL = "https://accounts.spotify.com/authorize?"
const tokenURL = "https://accounts.spotify.com/api/token"

// @desc    redirect to authorisation URL to initiate OAuth flow
// @route   GET /api/spotify/authorisation_request
// @access  protected
const authorisationRequest = asyncHandler(async (req, res) => {
  const nonce = genNonce(16)
  await User.findByIdAndUpdate(req.user!.id, { spotifyNonce: nonce })
  const params = new URLSearchParams()
  params.append("response_type", "code")
  params.append("client_id", clientID)
  params.append("scope", scope)
  params.append("redirect_uri", redirectURI)
  params.append("state", nonce)
  res.status(200).json(authoriseURL + params)
})

// @desc    handle callback after request sent to authorisation URL
// @route   GET /api/spotify/callback
// @access  public
const authorisationCallback = asyncHandler(async (req, res) => {
  const code = req.query.code || null
  const state = req.query.state || null
  if (state !== null) {
    const user = await User.findOne({ spotifyNonce: state })
    if (user) {
      const basic = Buffer.from(`${clientID}:${clientSecret}`).toString(
        "base64"
      )
      res.clearCookie("spotify_auth_state")
      const body = new URLSearchParams()
      body.append("grant_type", "authorization_code")
      if (code) body.append("code", code.toString())
      body.append("redirect_uri", redirectURI)
      const options = {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basic}`,
        },
        body: body,
      }

      const response = await fetch(tokenURL, options)
      if (response.status === 200) {
        const accessTokenResponse = await response.json()
        if (isAccessTokenResponse(accessTokenResponse)) {
          await User.findByIdAndUpdate(user._id, {
            spotifyToken: accessTokenResponse.access_token,
            spotifyRefreshToken: accessTokenResponse.refresh_token,
            spotifyTokenTimestamp: Date.now(),
            spotifyTokenExpiresIn: accessTokenResponse.expires_in,
          })
          res.redirect(`${env.SITE_URL}?msg=Spotify success.`)
        } else res.redirect(`${env.SITE_URL}?msg=Response wasn't AccessToken.`)
      }
    } else res.redirect(`${env.SITE_URL}?msg=User not found from state(nonce).`)
  } else res.redirect(`${env.SITE_URL}?msg=Spotify didn't respond with state.`)
})

// @desc    removes spotify API credentials from user
// @route   PUT /api/spotify/revoke
// @access  private
const revokeAuthorisation = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user!.id, {
    spotifyToken: "",
    spotifyRefreshToken: "",
  })
  res.status(200).json()
})

async function refreshToken(user: IUser) {
  const basic = Buffer.from(`${clientID}:${clientSecret}`).toString("base64")
  const body = new URLSearchParams()
  body.append("grant_type", "refresh_token")
  body.append("refresh_token", user.spotifyRefreshToken)
  body.append("redirect_uri", redirectURI)
  const options = {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: body,
  }
  const response = await fetch(tokenURL, options)
  if (response.status === 200) {
    const refreshTokenResponse = await response.json()
    if (isRefreshTokenResponse(refreshTokenResponse)) {
      const update = refreshTokenResponse.refresh_token
        ? {
            spotifyToken: refreshTokenResponse.access_token,
            spotifyRefreshToken: refreshTokenResponse.refresh_token,
            spotifyTokenTimestamp: Date.now(),
            spotifyTokenExpiresIn: refreshTokenResponse.expires_in,
          }
        : {
            spotifyToken: refreshTokenResponse.access_token,
            spotifyTokenTimestamp: Date.now(),
            spotifyTokenExpiresIn: refreshTokenResponse.expires_in,
          }
      await User.findByIdAndUpdate(user._id, update)
      return true
    }
  }
  return false
}

async function spotifyRequest(url: string, user: IUser): Promise<{}> {
  const options = {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${user.spotifyToken}`,
    },
  }
  const response = (await fetch(url, options)) as Response
  console.log(response.status)

  if (response.status === 200) return await response.json()
  else if (response.status === 401) {
    if (await refreshToken(user)) spotifyRequest(url, user)
    else throw new Error("Bad token. Please re-authenticate Spotify.")
  } else if (response.status === 403) {
    const error = await response.json()
    const errorMsg = error.message ? error.message : "Bad OAuth request"
    throw new Error(errorMsg)
  } else if (response.status === 404) {
    throw new Error("Spotify resource not found.")
  } else if (response.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 10000))
    return await spotifyRequest(url, user) // ! untested as rate limit couldn't be hit
  }
  return await response.json()
}

// checks spotifyToken doesn't expire for atleast 15 minutes, if it does, refresh token
// * has side effects on user
async function checkRefreshToken(user: IUser): Promise<void> {
  console.log("refresh token ran")

  if (
    user.spotifyTokenExpiresIn * 1000 -
      (Date.now() - user.spotifyTokenTimestamp) <
    900000
  ) {
    console.log(user)

    await refreshToken(user)
    user = (await User.findById(user._id)) as IUser
    console.log(user)
  }
}

export {
  authorisationRequest,
  authorisationCallback,
  revokeAuthorisation,
  refreshToken,
  spotifyRequest,
  checkRefreshToken,
}
