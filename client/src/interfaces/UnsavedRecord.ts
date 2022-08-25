export default interface UnsavedRecord {
  discogsID?: string
  user: string
  catno?: string
  title: string
  artists: string
  label?: string
  year?: number
  mixable: boolean
}
