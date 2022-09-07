const express = require("express")
const router = express.Router()

const {
  addTrack,
  updateTrack,
  deleteTrack,
} = require("../controllers/trackController")

const { protect } = require("../middleware/authMiddleware")

router.route("/").post(protect, addTrack).delete(protect, deleteTrack)
router.route("/:id").put(protect, updateTrack)

module.exports = router
