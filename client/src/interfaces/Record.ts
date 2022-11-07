import { Track } from "@/interfaces/Track"

export default interface Record {
  _id: string
  discogsID?: string
  user: string
  catno: string
  title: string
  artists: string
  label: string
  year: number
  cover: string
  mixable: boolean
  tracks: Track[]
}
