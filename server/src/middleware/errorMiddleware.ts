import { Request, Response, NextFunction } from "express"
const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  res.status(res.statusCode ? res.statusCode : 500)
  if (process.env.NODE_ENV === "production")
    res.json({
      message: err.message,
    })
  else
    res.json({
      message: err.message,
      stack: process.env.NODE_ENV === "production" ? null : err.stack,
    })
}
export default errorHandler
