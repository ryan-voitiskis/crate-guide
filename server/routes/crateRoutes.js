const express = require("express")
const router = express.Router()

const {
  getCrates,
  setCrate,
  updateCrate,
  deleteCrate,
} = require("../controllers/crateController")

const { protect } = require("../middleware/authMiddleware")

router.route("/").get(protect, getCrates).post(protect, setCrate)
router.route("/:id").delete(protect, deleteCrate).put(protect, updateCrate)

module.exports = router
