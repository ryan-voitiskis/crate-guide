export default interface Crate {
  id: string
  user: string
  name: string
  records?: [
    {
      id: string
      discogsID: number
      catno: string
      label: string
      title: string
      artists: string
      year: number
      tracks?: [
        {
          position: string
          title: string
          duration: string
          bpm: number
          rpm: number
          genre: string
          playable: boolean
        }
      ]
    }
  ]
}
