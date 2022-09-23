export default interface User {
  _id: string
  discogsUID: string
  isDiscogsOAuthd: boolean
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
