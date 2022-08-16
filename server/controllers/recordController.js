const asyncHandler = require("express-async-handler")

const Record = require("../models/recordModel")
const User = require("../models/userModel")

// @desc    Get records
// @route   GET /api/records
// @access  Private
const getRecords = asyncHandler(async (req, res) => {
  const records = await Record.find({ user: req.user.id })

  res.status(200).json(records)
})

// @desc    Set record
// @route   POST /api/records
// @access  Private
const setRecord = asyncHandler(async (req, res) => {
  if (!req.user.id) {
    res.status(400)
    throw new Error("Record controller: user not provided.")
  }

  if (!req.body.artist) {
    res.status(400)
    throw new Error("Record controller: artist not provided.")
  }

  if (!req.body.title) {
    res.status(400)
    throw new Error("Record controller: title not provided.")
  }

  // TODO: validate
  const year = req.body.year ? parseInt(req.body.year) : null

  const mixable = req.body.mixable == "1" ? true : false

  const record = await Record.create({
    user: req.user.id,
    catno: req.body.catno,
    artist: req.body.artist,
    title: req.body.title,
    label: req.body.label,
    year: year,
    mixable: mixable,
  })

  res.status(200).json(record)
})

// @desc    Update record
// @route   PUT /api/records/:id
// @access  Private
const updateRecord = asyncHandler(async (req, res) => {
  const record = await Record.findById(req.params.id)

  if (!record) {
    res.status(400)
    throw new Error("Record not found")
  }

  // Check for user
  if (!req.user) {
    res.status(401)
    throw new Error("User not found")
  }

  // Make sure the logged in user matches the record user
  if (record.user.toString() !== req.user.id) {
    res.status(401)
    throw new Error("User not authorized")
  }

  const updatedRecord = await Record.findByIdAndUpdate(
    req.params.id,
    req.body,
    {
      // TODO: remove this if unnecessary
      // You should set the new option to true to return the document after update was applied.
      // from https://mongoosejs.com/docs/tutorials/findoneandupdate.html
      new: true, // TODO: remove this if unnecessary
    }
  )

  res.status(200).json(updatedRecord)
})

// @desc    Delete record
// @route   DELETE /api/records/:id
// @access  Private
const deleteRecord = asyncHandler(async (req, res) => {
  const record = await Record.findById(req.params.id)

  if (!record) {
    res.status(400)
    throw new Error("Record not found")
  }

  // Check for user
  if (!req.user) {
    res.status(401)
    throw new Error("User not found")
  }

  // Make sure the logged in user matches the record user
  if (record.user.toString() !== req.user.id) {
    res.status(401)
    throw new Error("User not authorized")
  }

  await record.remove()

  res.status(200).json({ id: req.params.id })
})

module.exports = {
  getRecords,
  setRecord,
  updateRecord,
  deleteRecord,
}
