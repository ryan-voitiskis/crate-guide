import Track from "@/interfaces/Track"

export default interface Record {
  _id: string
  discogsID?: string
  user: string
  catno: string
  title: string
  artists: string
  label: string
  year: number
  mixable: boolean
  // createdAt: string // ? make '?' optional?
  // updatedAt: string // ? make '?' optional?
  tracks: Track[]
}

// ! catno, label and year were optional, but are always stored as either "" for string or null for number
// export default interface Record {
//   _id: string
//   discogsID?: string
//   user: string
//   catno?: string
//   title: string
//   artists: string
//   label?: string
//   year?: number
//   mixable: boolean
//   createdAt: string
//   updatedAt: string
//   tracks: Track[]
// }
