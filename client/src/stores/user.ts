import { defineStore } from "pinia"

export const userStore = defineStore("user", {
  state: () => ({ id: 0, name: "", email: "", token: "" }),
  actions: {
    login(id: number, name: string, email: string, token: string) {
      this.id = id
      this.name = name
      this.email = email
      this.token = token
    },
    logout() {
      this.id = 0
      this.name = ""
      this.email = ""
      this.token = ""
    },
  },
})
