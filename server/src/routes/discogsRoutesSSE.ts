import express from "express"
import protect from "../middleware/authMiddleware.js"
import { importRecords } from "../controllers/discogsController.js"

const router = express.Router()

router.post("/import_records", protect, importRecords)

export default router
