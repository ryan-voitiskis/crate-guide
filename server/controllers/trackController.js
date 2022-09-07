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
    { _id: req.body.recordID },
    { $push: { tracks: track } },
    { new: true }
  )

  res.status(201).json(updatedRecord)
})

// @desc    Update track
// @route   PUT /api/tracks/:id
// @access  Private
// ! copied and untested
const updateTrack = asyncHandler(async (req, res) => {
  // const oldTrack = await Track.findById(req.params.id)
  // if (!oldTrack) {
  //   res.status(400)
  //   throw new Error("Track not found")
  // }
  // // Check for user
  // if (!req.user) {
  //   res.status(401)
  //   throw new Error("User not found")
  // }
  // // Make sure the logged in user matches the existing tracks user
  // if (oldTrack.user.toString() !== req.user.id) {
  //   res.status(401)
  //   throw new Error("User not authorized")
  // }
  // const updatedTrack = await Track.findByIdAndUpdate(
  //   req.params.id,
  //   JSON.parse(req.body.track),
  //   {
  //     new: true,
  //   }
  // )
  // res.status(200).json(updatedTrack)
})

// @desc    Delete tracks - for single or many
// @route   DELETE /api/tracks
// @access  Private
// ! copied and untested
const deleteTrack = asyncHandler(async (req, res) => {
  // // Check for user
  // if (!req.user) {
  //   res.status(401)
  //   throw new Error("User not found")
  // }
  // const deletes = JSON.parse(req.body.tracks) // from client: array of IDs to be deleted
  // // remove tracks in 'deletes' from crates
  // await Crate.updateMany(
  //   { user: req.user.id },
  //   { $pull: { tracks: { $in: deletes } } }
  // )
  // // delete tracks in deletes, user checked here
  // const deleted = await Track.deleteMany({
  //   $and: [{ _id: { $in: deletes } }, { user: req.user.id }],
  // })
  // res.status(200).json(deleted)
})

module.exports = {
  addTrack,
  updateTrack,
  deleteTrack,
}
