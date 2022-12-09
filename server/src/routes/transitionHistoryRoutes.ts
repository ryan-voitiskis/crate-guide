import express from "express"
import protect from "../middleware/authMiddleware.js"
import {
  getTransitionHistories,
  saveTransitionHistory,
  deleteTransitionHistory,
} from "../controllers/transitionHistoryController.js"

const router = express.Router()

router
  .route("/")
  .get(protect, getTransitionHistories)
  .post(protect, saveTransitionHistory)
router.route("/:id").delete(protect, deleteTransitionHistory)

export default router
