import jwt from "jsonwebtoken"
import bcrypt from "bcryptjs"
import asyncHandler from "express-async-handler"
import User from "../models/userModel.js"
import env from "../env.js"

// @desc    add new user
// @route   POST /api/users
// @access  public
const addUser = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body
  if (!name || !email || !password) {
    res.status(400)
    throw new Error("Please add all fields")
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
      discogsUID: user.discogsUID,
      isDiscogsOAuthd: false,
      token: generateToken(user._id.toString()),
    })
  } else {
    res.status(400)
    throw new Error("Invalid user data")
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
      discogsUID: user.discogsUID,
      isDiscogsOAuthd:
        user.discogsToken && user.discogsTokenSecret ? true : false,
    })
  } else {
    res.status(401)
    throw new Error("Invalid credentials")
  }
})

// @desc    get user data
// @route   GET /api/users/me
// @access  private
const getUser = asyncHandler(async (req, res) => {
  res.status(200).json(req.user)
})

// generate JWT
const generateToken = (id: string) => {
  return jwt.sign({ id }, env.JWT_SECRET, {
    expiresIn: "30d",
  })
}

// @desc    update user
// @route   PUT /api/users/:id
// @access  private
const updateUser = asyncHandler(async (req, res) => {
  if (!req.user) res.status(400).json({ message: "User not provided" })
  const user = await User.findById(req.params.id)

<<<<<<< HEAD
  if (!user) res.status(400).json({ message: "User not found" })
  if (user!._id.valueOf() !== req.user!.id)
    res.status(401).json({ message: "User not authorised" })
=======
  if (!user) {
    res.status(400)
    throw new Error("User not found")
  }

  if (!req.user) {
    res.status(400)
    throw new Error("User not found")
  }

  if (user._id.toString() !== req.user.id) {
    res.status(401)
    throw new Error("User not authorized")
  }
>>>>>>> parent of ffb0001 (server ts bugs + cleanup)

  await User.findByIdAndUpdate(req.params.id, req.body, { new: true })

  res.status(200).json()
})

// @desc    removes discogsToken, discogsTokenSecret, discogsRequestToken and discogsRequestTokenSecret from user
// @route   PUT /api/users/revoke_discogs/:id
// @access  private
const revokeDiscogsTokens = asyncHandler(async (req, res) => {
  if (!req.user) res.status(400).json({ message: "User not provided" })
  console.log("fire")
  const user = await User.findById(req.params.id)

  if (!user) res.status(400).json({ message: "User not found" })
  if (user!._id.valueOf() !== req.user!.id)
    res.status(401).json({ message: "User not authorised" })

  await User.findByIdAndUpdate(req.params.id, {
    discogsToken: "",
    discogsTokenSecret: "",
    discogsRequestToken: "",
    discogsRequestTokenSecret: "",
  })
  res.status(200).json()
})

export { addUser, loginUser, getUser, updateUser, revokeDiscogsTokens }
