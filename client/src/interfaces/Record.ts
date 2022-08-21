import Track from "@/interfaces/Track"

export default interface Record {
  _id?: string // ? optional as not created yet for unsaved crate, is this a problem?
  user: string
  catno?: string
  title: string
  artists: string
  label?: string
  year?: string
  mixable: boolean
  createdAt?: string // ? optional as not created yet, is this needed?
  updatedAt?: string // ? optional as not created yet, is this needed?
  tracks?: Track[]
}
