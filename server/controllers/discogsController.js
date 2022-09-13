import bcrypt from "bcryptjs"
import got from "got"
import asyncHandler from "express-async-handler"
import User from "../models/userModel.js"

const oauth_consumer_key = "WJSUzMPCQcGdEFidpwqn"
const oauth_consumer_secret = "oyasysRSKMwElyRpJjulWoxFBdaXDDTS"
const oauth_callback = "WJSUzMPCQcGdEFidpwqn"
const oauth_signature = "ipUXkWruphKQSgbGmDS4dgamixA%3D"
const requestTokenURL = "https://api.discogs.com/oauth/request_token"
const authoriseURL = "https://www.discogs.com/oauth/authorize"
const accessTokenURL = "https://api.discogs.com/oauth/access_token"
const oauthCallback = ""
// const oauthCallback = "http://localhost:8080/"
const userAgent = "CrateGuide/0.2"

const nonce = () => {
  let text = ""
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length))
  }
  return text
}

// @desc    todo
// @route   GET /api/discogs/request_token
// @access  Private
const requestToken = asyncHandler(async (req, res) => {
  console.log("fire")
  const params = new URLSearchParams()
  params.append("oauth_consumer_key", oauth_consumer_key)
  params.append("oauth_nonce", nonce())
  params.append("oauth_signature", oauth_consumer_secret)
  params.append("oauth_signature_method", "PLAINTEXT")
  params.append("oauth_timestamp", Date.now().toString())
  params.append("oauth_callback", oauthCallback)

  const options = {
    method: "GET",
    headers: {
      "User-Agent": userAgent,
    },
  }
  console.log(requestTokenURL + params)
  const response = await got(requestTokenURL + "?" + params, options).json()
  console.log(response)
  return response
})

// @desc    todo
// @route   GET /api/discogs/access_token
// @access  Private
const accessToken = asyncHandler(async (req, res) => {
  const { email, password } = req.body
  const user = await User.findOne({ email })
  if (user && (await bcrypt.compare(password, user.password))) {
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      settings: user.settings,
      token: generateToken(user._id),
      discogsUID: user.discogsUID,
    })
  } else {
    res.status(401)
    throw new Error("Invalid credentials")
  }
})

export { requestToken, accessToken }
