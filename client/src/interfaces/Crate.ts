export default interface Crate {
  _id?: string // ? optional as not created yet for unsaved crate, is this a problem?
  user: string
  name: string
  createdAt?: string // ? optional as not created yet, is this needed?
  updatedAt?: string // ? optional as not created yet, is this needed?
  records?: string[] //! remove the ? and the app crashes server w no relevant error output
}
