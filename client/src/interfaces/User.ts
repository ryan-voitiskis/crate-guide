export default interface User {
  _id: string
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
