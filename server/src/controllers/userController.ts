import jwt from "jsonwebtoken"
import bcrypt from "bcryptjs"
import asyncHandler from "express-async-handler"
import User from "../models/userModel.js"
import env from "../env.js"

// @desc    Add new user
// @route   POST /api/users
// @access  Public
const addUser = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body
  if (!name || !email || !password)
    res.status(400).json({ message: "Please add all fields" })

  const userExists = await User.findOne({ email })
  if (userExists)
    res
      .status(409)
      .json({ message: `An account using ${email} already exists.` })

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
      token: generateToken(user._id.toString()),
    })
  } else res.status(400).json({ message: "Invalid user data" })
})

// @desc    Authenticate a user
// @route   POST /api/users/login
// @access  Public
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
    })
  } else res.status(401).json({ message: "Invalid credentials" })
})

// @desc    Get user data
// @route   GET /api/users/me
// @access  Private
const getUser = asyncHandler(async (req, res) => {
  res.status(200).json(req.user)
})

// Generate JWT
const generateToken = (id: string) => {
  return jwt.sign({ id }, env.JWT_SECRET, {
    expiresIn: "30d",
  })
}

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private
const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id)

  if (!user) res.status(400).json({ message: "User not found" })
  if (!req.user) res.status(400).json({ message: "User not provided" })
  if (user!._id.valueOf() !== req.user!.id)
    res.status(401).json({ message: "User not authorised" })

  await User.findByIdAndUpdate(req.params.id, req.body, { new: true })
  res.status(200).json()
})

export { addUser, loginUser, getUser, updateUser }
