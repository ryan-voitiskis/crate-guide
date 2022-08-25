import Track from "@/interfaces/Track"

export default interface Record {
  _id: string
  discogsID?: string
  user: string
  catno?: string
  title: string
  artists: string
  label?: string
  year?: number
  mixable: boolean
  createdAt?: string // ? optional as not created yet, is this needed?
  updatedAt?: string // ? optional as not created yet, is this needed?
  tracks?: Track[]
}
