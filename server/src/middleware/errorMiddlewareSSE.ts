import { Request, Response, NextFunction } from "express"
const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  res.status(res.statusCode ? res.statusCode : 500)
  if (process.env.NODE_ENV === "production") {
    res.write("data: " + `${err.message}\n\n`)
    res.end()
  } else {
    res.write("data: " + `${err.stack}\n\n`)
    res.end()
  }
}
export default errorHandler
