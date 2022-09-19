import express from "express"
import protect from "../middleware/authMiddleware.js"
import {
  getCrates,
  addCrate,
  updateCrate,
  deleteCrate,
} from "../controllers/crateController.js"

const router = express.Router()

router.route("/").get(protect, getCrates).post(protect, addCrate)
router.route("/:id").delete(protect, deleteCrate).put(protect, updateCrate)

export default router
