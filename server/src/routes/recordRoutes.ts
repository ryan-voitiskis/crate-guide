import express from "express"
import protect from "../middleware/authMiddleware.js"
import {
  getRecords,
  addRecord,
  updateRecord,
  deleteRecords,
} from "../controllers/recordController.js"

const router = express.Router()

router
  .route("/")
  .get(protect, getRecords)
  .post(protect, addRecord)
  .delete(protect, deleteRecords)
router.route("/:id").put(protect, updateRecord)

export default router
