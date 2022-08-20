const express = require("express")
const router = express.Router()

const {
  getCrates,
  addCrate,
  updateCrate,
  deleteCrate,
} = require("../controllers/crateController")

const { protect } = require("../middleware/authMiddleware")

router.route("/").get(protect, getCrates).post(protect, addCrate)
router.route("/:id").delete(protect, deleteCrate).put(protect, updateCrate)

module.exports = router
