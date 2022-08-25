const express = require("express")
const router = express.Router()

const {
  getRecords,
  addRecord,
  updateRecord,
  deleteRecords,
} = require("../controllers/recordController")

const { protect } = require("../middleware/authMiddleware")

router
  .route("/")
  .get(protect, getRecords)
  .post(protect, addRecord)
  .delete(protect, deleteRecords)
router.route("/:id").put(protect, updateRecord)

module.exports = router
