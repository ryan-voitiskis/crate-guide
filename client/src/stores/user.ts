import { defineStore } from "pinia"

export const userStore = defineStore("user", {
  state: () => ({
    id: 0,
    name: "",
    email: "",
    token: "",
    settings: {
      theme: "light",
      turntableTheme: "silver",
      turntablePitchRange: "8",
    },
  }),
  actions: {
    login(
      id: number,
      name: string,
      email: string,
      token: string,
      theme: string,
      turntableTheme: string,
      turntablePitchRange: string
    ) {
      this.id = id
      this.name = name
      this.email = email
      this.token = token
      this.settings.theme = theme
      this.settings.turntableTheme = turntableTheme
      this.settings.turntablePitchRange = turntablePitchRange
    },
    logout() {
      this.id = 0
      this.name = ""
      this.email = ""
      this.token = ""
      this.settings = {
        theme: "light",
        turntableTheme: "silver",
        turntablePitchRange: "8",
      }
    },
  },
})

// TODO: everything here seems too verbose, try simplify

// wanted to do something like this:
// login(
//   data: User
// ) {
//   this.id = data.id
//   etc..
// },
