import express from "express"
import protect from "../middleware/authMiddleware.js"
import {
  addTrack,
  updateTrack,
  deleteTrack,
} from "../controllers/trackController.js"

const router = express.Router()

router.route("/").post(protect, addTrack)
router.route("/:id").delete(protect, deleteTrack).put(protect, updateTrack)

export default router
