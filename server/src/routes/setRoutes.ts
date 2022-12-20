import { getSets, saveSet, deleteSet } from "../controllers/setController.js"
import express from "express"
import protect from "../middleware/authMiddleware.js"

const router = express.Router()

router.route("/").get(protect, getSets).post(protect, saveSet)
router.route("/:id").delete(protect, deleteSet)

export default router
