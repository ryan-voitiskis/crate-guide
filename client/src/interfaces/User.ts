export default interface User {
  _id: string
  discogsUID: string
  discogsToken: string // todo: remove, call to api from server
  discogsTokenSecret: string // todo: remove, call to api from server
  name: string
  email: string
  token: string
  settings: {
    theme: string
    turntableTheme: string
    turntablePitchRange: string
    selectedCrate: string
  }
}
