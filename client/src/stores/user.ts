import { defineStore } from "pinia"
import User from "../interfaces/User"

export const userStore = defineStore("user", {
  state: (): User => ({
    id: "",
    name: "",
    email: "",
    token: "",
    settings: {
      theme: "light",
      turntableTheme: "silver",
      turntablePitchRange: "8",
      selectedCrate: "all",
    },
  }),
  actions: {
    login(user: User) {
      Object.assign(this, user)
    },
    hasUser() {
      return this.id != ""
    },
  },
})
