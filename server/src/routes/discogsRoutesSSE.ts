import { importRecords } from "../controllers/discogsController.js"
import express from "express"
import protect from "../middleware/authMiddleware.js"

const router = express.Router()

router.post("/import_records", protect, importRecords)

export default router
