export default interface User {
  id: string
  discogsUID: string
  discogsToken: string
  discogsTokenSecret: string
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
