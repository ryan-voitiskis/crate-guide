import { User } from "../models/userModel.js"
import asyncHandler from "express-async-handler"
import bcrypt from "bcryptjs"
import env from "../env.js"
import jwt from "jsonwebtoken"
import { v4 } from "uuid"

const elasticmail_send_endpoint = "https://api.elasticemail.com/v2/email/send"

// generate JWT
const generateToken = (id: string) => {
  return jwt.sign({ id }, env.JWT_SECRET, {
    expiresIn: "30d",
  })
}

// @desc    add new user
// @route   POST /api/users
// @access  public
const addUser = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body

  if (!name || !email || !password) {
    res.status(400)
    throw new Error("Please add all fields.")
  }

  const userExists = await User.findOne({ email })

  if (userExists) {
    res.status(409)
    throw new Error(`An account using ${email} already exists.`)
  }

  // hash password
  const salt = await bcrypt.genSalt(10)
  const hashedPassword = await bcrypt.hash(password, salt)

  // create user
  const user = await User.create({
    name,
    email,
    password: hashedPassword,
  })

  if (user) {
    res.status(201).json({
      _id: user.id,
      name: user.name,
      email: user.email,
      settings: user.settings,
      discogsUsername: user.discogsUsername,
      isDiscogsOAuthd: false,
      justCompleteDiscogsOAuth: false,
      token: generateToken(user._id.toString()),
    })
  } else {
    res.status(400)
    throw new Error("Invalid user data.")
  }
})

// @desc    authenticate a user
// @route   POST /api/users/login
// @access  public
const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body
  const user = await User.findOne({ email })
  if (user && (await bcrypt.compare(password, user.password))) {
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      settings: {
        theme: user.settings.theme,
        turntableTheme: user.settings.turntableTheme,
        turntablePitchRange: user.settings.turntablePitchRange,
        selectedCrate: user.settings.selectedCrate,
        keyFormat: user.settings.keyFormat,
        listLayout: 0, // always record view on load. avoids frequent updateSettings API calls
      },
      token: generateToken(user.id),
      discogsUsername: user.discogsUsername,
      isDiscogsOAuthd:
        user.discogsToken && user.discogsTokenSecret ? true : false,
      justCompleteDiscogsOAuth: user.justCompleteDiscogsOAuth, // user shouldn't have to login after OAuth flow, but just incase
      isSpotifyOAuthd: user.spotifyToken ? true : false,
    })
    // set justCompleteDiscogsOAuth flag to false if true
    if (user.justCompleteDiscogsOAuth)
      await User.findByIdAndUpdate(user._id, {
        justCompleteDiscogsOAuth: false,
      })
  } else {
    res.status(401)
    throw new Error("Invalid credentials.")
  }
})

// @desc    get user data
// @route   GET /api/users/
// @access  private
const getUser = asyncHandler(async (req, res) => {
  res.status(200).json({
    _id: req.user!._id,
    name: req.user!.name,
    email: req.user!.email,
    settings: {
      theme: req.user!.settings.theme,
      turntableTheme: req.user!.settings.turntableTheme,
      turntablePitchRange: req.user!.settings.turntablePitchRange,
      selectedCrate: req.user!.settings.selectedCrate,
      keyFormat: req.user!.settings.keyFormat,
      listLayout: 0, // always record view on load. avoids frequent updateSettings API calls
    },
    token: generateToken(req.user!.id),
    discogsUsername: req.user!.discogsUsername,
    isDiscogsOAuthd:
      req.user!.discogsToken && req.user!.discogsTokenSecret ? true : false,
    justCompleteDiscogsOAuth: req.user!.justCompleteDiscogsOAuth,
    isSpotifyOAuthd: req.user!.spotifyToken ? true : false,
  })
  // set justCompleteDiscogsOAuth flag to false if true
  if (req.user!.justCompleteDiscogsOAuth)
    await User.findByIdAndUpdate(req.user!._id, {
      justCompleteDiscogsOAuth: false,
    })
})

// @desc    update user
// @route   PUT /api/users/:id
// @access  private
const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id)
  if (user!._id.valueOf() !== req.user!.id) {
    res.status(401)
    throw new Error("User not authorised.")
  }

  await User.findByIdAndUpdate(
    req.params.id,
    {
      $set: { settings: JSON.parse(req.body.settings) },
    },
    {
      new: true,
    }
  )
  res.status(200).json()
})

// todo: move this later
interface ElastimailSendResponse {
  success: boolean
}

// @desc    send user a reset password link
// @route   POST /api/users/forgot-password
// @access  public
const sendResetPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({
    email: req.body.email,
  })

  if (!user) {
    res.status(404)
    throw new Error("No user with that email.")
  }

  const resetToken = v4()
  const resetUrl = `${env.SITE_URL}/reset-password/${resetToken}`

  // todo: move this later, possibly fn with name and resetURL params
  const bodyHtml = `<p>Hi ${user.name},</p>
  <p>Click the link below to reset your password.</p>
  <a href="${resetUrl}">Reset password</a>
  <p>If you didn't request a password reset, please ignore this email.</p>
  <p>Please note that this link will expire in 1 hour.</p>
  <p>Don't reply to this email. It's not monitored.</p>`

  const URLParams = new URLSearchParams()
  URLParams.append("apikey", env.ELASTICMAIL_KEY)
  URLParams.append("subject", "Reset password for Crate Guide")
  URLParams.append("from", "admin@crate.guide")
  URLParams.append("to", user.email)
  URLParams.append("bodyHtml", bodyHtml)
  URLParams.append("isTransactional", "true")

  const options = {
    method: "POST",
  }

  const response = await fetch(
    elasticmail_send_endpoint + "?" + URLParams,
    options
  )

  if (response.status === 200) {
    const responseJSON = (await response.json()) as ElastimailSendResponse
    console.log(responseJSON)
    if (responseJSON.success) {
      await User.findByIdAndUpdate(user._id, {
        $set: {
          passwordResetToken: resetToken,
          passwordResetTokenCreatedAt: Date.now(),
        },
      })
      res.status(200).json()
    }
  }
  res.status(404)
  throw new Error(
    "Recovery email couldn't be sent. Please email ryanvoitiskis@pm.me"
  )
})

export { addUser, loginUser, getUser, updateUser, sendResetPassword }
