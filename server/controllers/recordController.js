const asyncHandler = require("express-async-handler")
const Crate = require("../models/crateModel")
const Record = require("../models/recordModel")

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

  if (!req.body.title) {
    res.status(400)
    throw new Error("Title not provided.")
  }

  if (!req.body.artists) {
    res.status(400)
    throw new Error("Artists not provided.")
  }

  const record = await Record.create({
    user: req.user.id,
    catno: req.body.catno,
    title: req.body.title,
    artists: req.body.artists,
    label: req.body.label,
    year: req.body.year,
    mixable: req.body.mixable == "1" ? true : false,
  })

  res.status(201).json(record)
})

// @desc    Update record
// @route   PUT /api/records/:id
// @access  Private
// ! untested and copied without appropriation edit
const updateRecord = asyncHandler(async (req, res) => {
  // const record = await Record.findById(req.params.id)

  // if (!record) {
  //   res.status(400)
  //   throw new Error("Record not found")
  // }

  // // Check for user
  // if (!req.user) {
  //   res.status(401)
  //   throw new Error("User not found")
  // }

  // // Make sure the logged in user matches the record user
  // if (record.user.toString() !== req.user.id) {
  //   res.status(401)
  //   throw new Error("User not authorized")
  // }

  // const updatedRecord = await Record.findByIdAndUpdate(
  //   req.params.id,
  //   req.body,
  //   {
  //     // TODO: remove this if unnecessary
  //     // You should set the new option to true to return the document after update was applied.
  //     // from https://mongoosejs.com/docs/tutorials/findoneandupdate.html
  //     new: true,
  //   }
  // )

  res.status(200).json("nothing")
})

// @desc    Delete records - for single or many
// @route   DELETE /api/records
// @access  Private
const deleteRecords = asyncHandler(async (req, res) => {
  // Check for user
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

module.exports = {
  getRecords,
  addRecord,
  updateRecord,
  deleteRecords,
}
