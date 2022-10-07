import express from "express"
import protect from "../middleware/authMiddleware.js"
import {
  addUser,
  loginUser,
  getUser,
  updateUser,
} from "../controllers/userController.js"

const router = express.Router()

router.post("/", addUser)
router.post("/login", loginUser)
router.get("/", protect, getUser)
router.put("/:id", protect, updateUser)

export default router
