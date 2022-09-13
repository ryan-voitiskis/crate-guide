import asyncHandler from "express-async-handler"
import Crate from "../models/crateModel.js"
import Record from "../models/recordModel.js"

// @desc    Get records
// @route   GET /api/records
// @access  Private
const getRecords = asyncHandler(async (req, res) => {
  const records = await Record.find({ user: req.user.id })

  res.status(200).json(records)
})

// @desc    Add record
// @route   POST /api/records
// @access  Private
const addRecord = asyncHandler(async (req, res) => {
  if (!req.user.id) {
    res.status(400)
    throw new Error("User not provided.")
  }

  const record = JSON.parse(req.body.record)

  if (!record.title) {
    res.status(400)
    throw new Error("Title not provided.")
  }

  if (!record.artists) {
    res.status(400)
    throw new Error("Artists not provided.")
  }

  const createdRecord = await Record.create(record)

  res.status(201).json(createdRecord)
})

// @desc    Update record
// @route   PUT /api/records/:id
// @access  Private
const updateRecord = asyncHandler(async (req, res) => {
  const oldRecord = await Record.findById(req.params.id)

  if (!oldRecord) {
    res.status(400)
    throw new Error("Record not found")
  }

  if (!req.user) {
    res.status(401)
    throw new Error("User not found")
  }

  if (oldRecord.user.toString() !== req.user.id) {
    res.status(401)
    throw new Error("User not authorized")
  }

  const updatedRecord = await Record.findByIdAndUpdate(
    req.params.id,
    JSON.parse(req.body.record),
    { new: true }
  )

  res.status(200).json(updatedRecord)
})

// @desc    Delete records - for single or many
// @route   DELETE /api/records
// @access  Private
const deleteRecords = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(401)
    throw new Error("User not found")
  }
  const deletes = JSON.parse(req.body.records) // from client: array of IDs to be deleted

  // remove records in 'deletes' from crates
  await Crate.updateMany(
    { user: req.user.id },
    { $pull: { records: { $in: deletes } } }
  )

  // delete records in deletes, user checked here
  const deleted = await Record.deleteMany({
    $and: [{ _id: { $in: deletes } }, { user: req.user.id }],
  })

  res.status(200).json(deleted)
})

export { getRecords, addRecord, updateRecord, deleteRecords }
