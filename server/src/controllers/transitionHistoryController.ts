import asyncHandler from "express-async-handler"
import { TransitionHistory } from "../models/transitionHistoryModel.js"

// @desc    get histories
// @route   GET /api/histories
// @access  private
const getTransitionHistories = asyncHandler(async (req, res) => {
  const histories = await TransitionHistory.find({ user: req.user!.id })

  res.status(200).json(histories)
})

// @desc    save history
// @route   POST /api/histories
// @access  private
const saveTransitionHistory = asyncHandler(async (req, res) => {
  const history = JSON.parse(req.body.history)
  history.user = req.user!.id

  if (!history.history) {
    res.status(400)
    throw new Error("History not provided.")
  }

  const createdHistory = await TransitionHistory.create(history)
  res.status(201).json(createdHistory)
})

// @desc    delete history
// @route   DELETE /api/histories/:id
// @access  private
const deleteTransitionHistory = asyncHandler(async (req, res) => {
  const history = await TransitionHistory.findById(req.params.id)

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

export {
  getTransitionHistories,
  saveTransitionHistory,
  deleteTransitionHistory,
}
