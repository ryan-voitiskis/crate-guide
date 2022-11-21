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
    turntablePitchRange: number
    selectedCrate: string
    keyFormat: "key" | "camelot" // todo: should this be on backend? also other settings or properties declared like this?
    listLayout: number
  }
}
