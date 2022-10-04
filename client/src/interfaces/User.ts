export default interface User {
  _id: string
  discogsUID: string
  isDiscogsOAuthd: boolean
  name: string
  email: string
  token: string
  justCompleteDiscogsOAuth: boolean // flag to indicate OAuth flow successfully complete
  settings: {
    theme: string
    turntableTheme: string
    turntablePitchRange: string
    selectedCrate: string
  }
}
