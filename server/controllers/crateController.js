const asyncHandler = require("express-async-handler")

const Crate = require("../models/crateModel")
// const User = require("../models/userModel") // TODO: delete if unused

// @desc    Get crates
// @route   GET /api/crates
// @access  Private
const getCrates = asyncHandler(async (req, res) => {
  const crates = await Crate.find({ user: req.user.id })

  res.status(200).json(crates)
})

// @desc    Add crate
// @route   POST /api/crates
// @access  Private
const addCrate = asyncHandler(async (req, res) => {
  if (!req.user.id) {
    res.status(400)
    throw new Error("Crate controller: user not provided.")
  }

  if (!req.body.name) {
    res.status(400)
    throw new Error("Crate controller: name not provided.")
  }

  const crate = await Crate.create({
    user: req.user.id,
    name: req.body.name,
  })

  res.status(201).json(crate)
})

// @desc    Update crate
// @route   PUT /api/crates/:id
// @access  Private
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
  if (crate.user.toString() !== req.user.id) {
    res.status(401)
    throw new Error("User not authorized")
  }

  const updatedCrate = await Crate.findByIdAndUpdate(req.params.id, req.body, {
    // TODO: remove this if unnecessary
    // You should set the new option to true to return the document after update was applied.
    // from https://mongoosejs.com/docs/tutorials/findoneandupdate.html
    new: true,
  })

  res.status(200).json(updatedCrate)
})

// @desc    Delete crate
// @route   DELETE /api/crates/:id
// @access  Private
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
  if (crate.user.toString() !== req.user.id) {
    res.status(401)
    throw new Error("User not authorized")
  }

  await crate.remove()

  res.status(200).json({ id: req.params.id })
})

module.exports = {
  getCrates,
  addCrate,
  updateCrate,
  deleteCrate,
}
