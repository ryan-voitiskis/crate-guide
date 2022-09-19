import asyncHandler from "express-async-handler"
import Crate from "../models/crateModel.js"

// @desc    Get crates
// @route   GET /api/crates
// @access  Private
const getCrates = asyncHandler(async (req, res) => {
  const crates = await Crate.find({ user: req.user?.id })
  res.status(200).json(crates)
})

// @desc    Add crate
// @route   POST /api/crates
// @access  Private
const addCrate = asyncHandler(async (req, res) => {
  if (!req.user?.id) res.status(400).json({ message: "User not provided" })
  const crate = JSON.parse(req.body.crate)
  if (!crate.name) res.status(400).json({ message: "Name not provided" })

  const createdCrate = await Crate.create(crate)
  res.status(201).json(createdCrate)
})

// @desc    Update crate
// @route   PUT /api/crates/:id
// @access  Private
const updateCrate = asyncHandler(async (req, res) => {
  if (!req.user) res.status(401).json({ message: "User not found" })
  const crate = await Crate.findById(req.params.id)

  if (!crate) res.status(400).json({ message: "Crate not found" })
  if (crate!.user!.valueOf() !== req.user!.id)
    res.status(401).json({ message: "User not authorised" })

  const updatedCrate = await Crate.findByIdAndUpdate(
    req.params.id,
    JSON.parse(req.body.crate),
    { new: true }
  )
  res.status(200).json(updatedCrate)
})

// @desc    Delete crate
// @route   DELETE /api/crates/:id
// @access  Private
const deleteCrate = asyncHandler(async (req, res) => {
  if (!req.user) res.status(401).json({ message: "User not found" })
  const crate = await Crate.findById(req.params.id)

  if (!crate) res.status(400).json({ message: "Crate not found" })
  if (crate!.user!.valueOf() !== req.user!.id)
    res.status(401).json({ message: "User not authorised" })

  await crate!.remove()
  res.status(200).json({ _id: req.params.id })
})

export { getCrates, addCrate, updateCrate, deleteCrate }
