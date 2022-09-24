import asyncHandler from "express-async-handler"
import Crate from "../models/crateModel.js"

// @desc    get crates
// @route   GET /api/crates
// @access  private
const getCrates = asyncHandler(async (req, res) => {
  const crates = await Crate.find({ user: req.user?.id })

  res.status(200).json(crates)
})

// @desc    add crate
// @route   POST /api/crates
// @access  private
const addCrate = asyncHandler(async (req, res) => {
  if (!req.user?.id) {
    res.status(400)
    throw new Error("User not provided.")
  }

  const crate = JSON.parse(req.body.crate)

  if (!crate.name) {
    res.status(400)
    throw new Error("Name not provided.")
  }

  const createdCrate = await Crate.create(crate)
  res.status(201).json(createdCrate)
})

// @desc    update crate
// @route   PUT /api/crates/:id
// @access  private
const updateCrate = asyncHandler(async (req, res) => {
  const crate = await Crate.findById(req.params.id)

  if (!crate) {
    res.status(400)
    throw new Error("Crate not found")
  }

  // Check for user
  if (!req.user) {
    res.status(401)
    throw new Error("User not found")
  }

  // Make sure the logged in user matches the crate user
  if (crate.user !== req.user.id) {
    res.status(401)
    throw new Error("User not authorized")
  }

  const updatedCrate = await Crate.findByIdAndUpdate(
    req.params.id,
    JSON.parse(req.body.crate), // required as crate needs to be sent as string
    { new: true }
  )

  res.status(200).json(updatedCrate)
})

// @desc    delete crate
// @route   DELETE /api/crates/:id
// @access  private
const deleteCrate = asyncHandler(async (req, res) => {
  const crate = await Crate.findById(req.params.id)

  if (!crate) {
    res.status(400)
    throw new Error("Crate not found")
  }

  // Check for user
  if (!req.user) {
    res.status(401)
    throw new Error("User not found")
  }

  // Make sure the logged in user matches the crate user
  if (crate.user !== req.user.id) {
    res.status(401)
    throw new Error("User not authorized")
  }

  await crate.remove()

  res.status(200).json({ _id: req.params.id })
})

export { getCrates, addCrate, updateCrate, deleteCrate }
