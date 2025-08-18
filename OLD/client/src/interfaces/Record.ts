import { Track } from "@/interfaces/Track"

export default interface Record {
  _id: string
  discogsID?: number
  user: string
  catno: string
  title: string
  artists: string
  label: string
  year: number
  cover: string
  tracks: Track[]
}
