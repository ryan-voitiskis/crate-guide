import jwt from "jsonwebtoken"
import bcrypt from "bcryptjs"
import asyncHandler from "express-async-handler"
import { User } from "../models/userModel.js"
import env from "../env.js"

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
      settings: user.settings,
      token: generateToken(user.id),
      discogsUsername: user.discogsUsername,
      isDiscogsOAuthd:
        user.discogsToken && user.discogsTokenSecret ? true : false,
      justCompleteDiscogsOAuth: user.justCompleteDiscogsOAuth, // user shouldn't have to login after OAuth flow, but just incase
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
    settings: req.user!.settings,
    token: generateToken(req.user!.id),
    discogsUsername: req.user!.discogsUsername,
    isDiscogsOAuthd:
      req.user!.discogsToken && req.user!.discogsTokenSecret ? true : false,
    justCompleteDiscogsOAuth: req.user!.justCompleteDiscogsOAuth,
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

  await User.findByIdAndUpdate(req.params.id, req.body, { new: true })
  res.status(200).json()
})

export { addUser, loginUser, getUser, updateUser }
