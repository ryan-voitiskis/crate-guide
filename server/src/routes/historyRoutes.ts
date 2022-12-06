import express from "express"
import protect from "../middleware/authMiddleware.js"
import {
  getHistories,
  addHistory,
  updateHistory,
  deleteHistory,
} from "../controllers/historyController.js"

const router = express.Router()

router.route("/").get(protect, getHistories).post(protect, addHistory)
router.route("/:id").delete(protect, deleteHistory).put(protect, updateHistory)

export default router
