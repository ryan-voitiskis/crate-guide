import jwt from "jsonwebtoken"
import asyncHandler from "express-async-handler"
import User from "../models/userModel.js"
import env from "../env.js"

interface JwtPayload {
  id: string
}

const protect = asyncHandler(async (req, res, next) => {
  let token

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      // get token from header
      token = req.headers.authorization.split(" ")[1]

      // verify token
      const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload

      // get user from the token
      req.user =
        (await User.findById(decoded.id).select("-password")) ?? undefined

      if (!req.user) {
        res.status(401)
        throw new Error("User not found.")
      }

      next()
    } catch (error) {
      console.log(error)
      res.status(401)
      throw new Error("Not authorised")
    }
  }

  if (!token) {
    res.status(401)
    throw new Error("Not authorised, no token")
  }
})

export default protect
