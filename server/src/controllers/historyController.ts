import asyncHandler from "express-async-handler"
import { History } from "../models/historyModel.js"

// @desc    get histories
// @route   GET /api/histories
// @access  private
const getHistories = asyncHandler(async (req, res) => {
  const histories = await History.find({ user: req.user!.id })

  res.status(200).json(histories)
})

// @desc    add history
// @route   POST /api/histories
// @access  private
const addHistory = asyncHandler(async (req, res) => {
  const history = JSON.parse(req.body.history)

  if (!history.history) {
    res.status(400)
    throw new Error("History not provided.")
  }

  const createdHistory = await History.create(history)
  res.status(201).json(createdHistory)
})

// @desc    update history
// @route   PUT /api/histories/:id
// @access  private
const updateHistory = asyncHandler(async (req, res) => {
  const history = await History.findById(req.params.id)

  if (!history) {
    res.status(400)
    throw new Error("History not found.")
  }

  if (history.user!.valueOf() !== req.user!.id) {
    res.status(401)
    throw new Error("User not authorised.")
  }

  const updatedHistory = await History.findByIdAndUpdate(
    req.params.id,
    JSON.parse(req.body.history),
    { new: true }
  )
  res.status(200).json(updatedHistory)
})

// @desc    delete history
// @route   DELETE /api/histories/:id
// @access  private
const deleteHistory = asyncHandler(async (req, res) => {
  const history = await History.findById(req.params.id)

  if (!history) {
    res.status(400)
    throw new Error("History not found.")
  }

  if (history.user!.valueOf() !== req.user!.id) {
    res.status(401)
    throw new Error("User not authorised.")
  }

  await history.remove()
  res.status(200).json({ _id: req.params.id })
})

export { getHistories, addHistory, updateHistory, deleteHistory }
