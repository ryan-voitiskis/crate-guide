import express from "express"
import protect from "../middleware/authMiddleware.js"
import { requestToken, accessToken } from "../controllers/discogsController.js"

const router = express.Router()

router.route("/request_token").get(protect, requestToken)
router.route("/access_token").get(protect, accessToken)

export default router
