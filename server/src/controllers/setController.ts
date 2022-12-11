import asyncHandler from "express-async-handler"
import { Set } from "../models/setModel.js"

// @desc    get sets
// @route   GET /api/sets
// @access  private
const getSets = asyncHandler(async (req, res) => {
  const sets = await Set.find({ user: req.user!.id })

  res.status(200).json(sets)
})

// @desc    save history
// @route   POST /api/sets
// @access  private
const saveSet = asyncHandler(async (req, res) => {
  const set = JSON.parse(req.body.set)
  set.user = req.user!.id

  if (!set.set) {
    res.status(400)
    throw new Error("Set not provided.")
  }

  const createdSet = await Set.create(set)

  res.status(201).json(createdSet)
})

// @desc    delete history
// @route   DELETE /api/sets/:id
// @access  private
const deleteSet = asyncHandler(async (req, res) => {
  const history = await Set.findById(req.params.id)

  if (!history) {
    res.status(400)
    throw new Error("Set not found.")
  }

  if (history.user!.valueOf() !== req.user!.id) {
    res.status(401)
    throw new Error("User not authorised.")
  }

  await history.remove()
  res.status(200).json({ _id: req.params.id })
})

export { getSets, saveSet, deleteSet }
