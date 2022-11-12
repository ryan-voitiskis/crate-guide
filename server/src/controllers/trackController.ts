import asyncHandler from "express-async-handler"
import { Record } from "../models/recordModel.js"

// @desc    add track
// @route   POST /api/tracks
// @access  private
const addTrack = asyncHandler(async (req, res) => {
  if (!req.user!.id) {
    res.status(400)
    throw new Error("User not provided.")
  }

  const track = JSON.parse(req.body.track)

  if (!track.title) {
    res.status(400)
    throw new Error("Title not provided.")
  }

  const updatedRecord = await Record.findByIdAndUpdate(
    { _id: req.body.recordID },
    { $push: { tracks: track } },
    { new: true }
  )

  res.status(201).json(updatedRecord)
})

// @desc    update track
// @route   PUT /api/tracks/:id
// @access  private
const updateTrack = asyncHandler(async (req, res) => {
  const record = await Record.findOne({
    user: req.user!.id,
    "tracks._id": req.params.id,
  })

  if (!record) {
    res.status(400)
    throw new Error("Track not found.")
  }

  const track = JSON.parse(req.body.track)

  // set track properties individually to avoid overwritting spotify imported data
  const updatedRecord = await Record.findOneAndUpdate(
    { _id: record._id, "tracks._id": req.params.id },
    {
      $set: {
        "tracks.$.position": track.position,
        "tracks.$.title": track.title,
        "tracks.$.artists": track.artists,
        "tracks.$.duration": track.duration,
        "tracks.$.bpm": track.bpm,
        "tracks.$.rpm": track.rpm,
        "tracks.$.key": track.key,
        "tracks.$.mode": track.mode,
        "tracks.$.genre": track.genre,
        "tracks.$.timeSignatureUpper": track.timeSignatureUpper,
        "tracks.$.timeSignatureLower": track.timeSignatureLower,
        "tracks.$.playable": track.playable,
      },
    },
    { new: true }
  )
  res.status(200).json(updatedRecord)
})

// @desc    delete track
// @route   DELETE /api/tracks
// @access  private
const deleteTrack = asyncHandler(async (req, res) => {
  const record = await Record.findOne({
    user: req.user!.id,
    "tracks._id": req.params.id,
  })

  if (!record) {
    res.status(400)
    throw new Error("Track not found.")
  }

  const updatedRecord = await Record.findOneAndUpdate(
    { _id: record.id, "tracks._id": req.params.id },
    { $pull: { tracks: { _id: req.params.id } } },
    { new: true }
  )
  res.status(200).json(updatedRecord)
})

export { addTrack, updateTrack, deleteTrack }
