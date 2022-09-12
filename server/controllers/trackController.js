const asyncHandler = require("express-async-handler")
const Record = require("../models/recordModel")

// @desc    Add track
// @route   POST /api/tracks
// @access  Private
const addTrack = asyncHandler(async (req, res) => {
  if (!req.user.id) {
    res.status(400)
    throw new Error("User not provided.")
  }

  const track = JSON.parse(req.body.track)

  if (!track.title) {
    res.status(400)
    throw new Error("Title not provided.")
  }

  const updatedRecord = await Record.findByIdAndUpdate(
    { id: req.body.recordID },
    { $push: { tracks: track } },
    { new: true }
  )

  res.status(201).json(updatedRecord)
})

// @desc    Update track
// @route   PUT /api/tracks/:id
// @access  Private
const updateTrack = asyncHandler(async (req, res) => {
  const record = await Record.findOne({
    user: req.user.id,
    "tracks.id": req.params.id,
  })

  if (!record) {
    res.status(400)
    throw new Error("Track not found")
  }

  const track = JSON.parse(req.body.track)

  const updatedRecord = await Record.findOneAndUpdate(
    { id: record.id, "tracks.id": req.params.id },
    { $set: { "tracks.$": track } },
    { new: true }
  )
  res.status(200).json(updatedRecord)
})

// @desc    Delete track
// @route   DELETE /api/tracks
// @access  Private
const deleteTrack = asyncHandler(async (req, res) => {
  const record = await Record.findOne({
    user: req.user.id,
    "tracks.id": req.params.id,
  })

  if (!record) {
    res.status(400)
    throw new Error("Track not found")
  }

  const updatedRecord = await Record.findOneAndUpdate(
    { id: record.id, "tracks.id": req.params.id },
    { $pull: { tracks: { id: req.params.id } } },
    { new: true }
  )
  res.status(200).json(updatedRecord)
})

module.exports = {
  addTrack,
  updateTrack,
  deleteTrack,
}
