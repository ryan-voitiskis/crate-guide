import express from "express"
import protect from "../middleware/authMiddleware.js"
import {
  addUser,
  loginUser,
  getUser,
  updateUser,
  revokeDiscogsTokens,
} from "../controllers/userController.js"

const router = express.Router()

router.post("/", addUser)
router.post("/login", loginUser)
router.get("/me", protect, getUser)
router.put("/:id", protect, updateUser)
router.post("/revoke_discogs/:id", protect, revokeDiscogsTokens)

export default router
