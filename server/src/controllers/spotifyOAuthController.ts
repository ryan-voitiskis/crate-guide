// OAuth flow as per:
// * https://developer.spotify.com/documentation/general/guides/authorization/code-flow/
import asyncHandler from "express-async-handler"
import env from "../env.js"
import fetch from "node-fetch"
import genNonce from "../utils/genNonce.js"
import { User } from "../models/userModel.js"
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
  await User.findByIdAndUpdate(req.user!.id, {
    spotifyNonce: nonce,
    spotifyAuthReqTimestamp: Date.now(),
  })
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
      // todo: remove this check and remove spotifyAuthReqTimestamp
      // check authorisation req was recent, avoid extremely unlikely collision. (probably unnecessary)
      if (Date.now() - user.spotifyAuthReqTimestamp < 300000) {
        const basic = Buffer.from(`${clientID}:${clientSecret}`).toString(
          "base64"
        )
        res.clearCookie("spotify_auth_state") // ? is this necessary, taken from guide
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
            })
            res.redirect(`${env.SITE_URL}?msg=Spotify success.`)
          } else
            res.redirect(`${env.SITE_URL}?msg=Response wasn't AccessToken.`)
        }
      } else
        res.redirect(`${env.SITE_URL}?msg=Spotify authorisation timed out.`)
    } else res.redirect(`${env.SITE_URL}?msg=User not found from state(nonce).`)
  } else res.redirect(`${env.SITE_URL}?msg=Spotify didn't respond with state.`)
})

// TODO: convert this to spotify and hook up to a button on front end
// @desc    removes discogs API creds from user
// @route   PUT /api/users/revoke_discogs
// @access  private
const revokeSpotifyAuthorisation = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user!.id)

  if (user!._id.valueOf() !== req.user!.id) {
    res.status(401)
    throw new Error("User not authorised.")
  }

  await User.findByIdAndUpdate(req.user!.id, {
    discogsUsername: "",
    discogsToken: "",
    discogsTokenSecret: "",
    discogsRequestToken: "",
    discogsRequestTokenSecret: "",
  })
  res.status(200).json()
})

const refreshToken = async (token: string) => {
  const user = await User.findOne({ spotifyToken: token })
  if (user) {
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
            }
          : {
              spotifyToken: refreshTokenResponse.access_token,
            }
        await User.findByIdAndUpdate(user._id, update)
        return true
      }
    }
  }
  return false
}

export {
  authorisationRequest,
  authorisationCallback,
  revokeSpotifyAuthorisation,
  refreshToken,
}
