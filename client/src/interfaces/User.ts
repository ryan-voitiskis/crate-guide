export default interface User {
  _id: string
  discogsUsername: string
  isDiscogsOAuthd: boolean
  isSpotifyOAuthd: boolean
  name: string
  email: string
  token: string
  justCompleteDiscogsOAuth: boolean // flag to indicate OAuth flow successfully complete
  settings: {
    theme: string
    turntableTheme: string
    turntablePitchRange: string
    selectedCrate: string
    keyFormat: string
    listLayout: number
  }
}
