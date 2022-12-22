import { defineStore } from "pinia"
import { crateStore } from "@/stores/crateStore"
import { discogsStore } from "@/stores/discogsStore"
import { recordStore } from "@/stores/recordStore"
import { sessionStore } from "@/stores/sessionStore"
import { trackStore } from "@/stores/trackStore"
import UnregisteredUser from "@/interfaces/UnregisteredUser"
import User from "@/interfaces/User"
import userService from "@/services/userService"

export const userStore = defineStore("user", {
  state: () => ({
    authd: {
      _id: "",
      name: "",
      email: "",
      token: "",
      discogsUsername: "",
      settings: {
        theme: "auto",
        turntableTheme: "silver",
        turntablePitchRange: 8,
        selectedCrate: "all",
        keyFormat: "key",
        listLayout: 0,
      },
    } as User,
    loading: false,
    errorMsg: "",
    invalidCreds: false,
    success: false,
    loginModal: false, // displays LoginForm.vue
    signUpModal: false, // displays SignUpForm.vue
    forgotPasswordModal: false, // displays RecoveryForm.vue
    settingsModal: false, // displays SettingsForm.vue
    resetPasswordModal: false, // displays ResetPasswordForm.vue
    resetToken: "", // used to verify password reset token
  }),
  actions: {
    async login(email: string, password: string): Promise<number | null> {
      this.invalidCreds = false
      this.loading = true
      this.errorMsg = ""
      try {
        const response = await userService.login(email, password)
        if (response.status === 200) {
          this.setUserAndFetchData(await response.json())
        } else if (response.status === 401) {
          this.invalidCreds = true
          this.errorMsg = "Invalid credentials"
        }
        this.loading = false
        return response.status
      } catch (error) {
        this.errorMsg = "Unexpected error. Probably network error."
        this.loading = false
        return null
      }
    },

    async fetchUser(token: string) {
      try {
        const response = await userService.fetchUser(token)
        if (response.status === 200) {
          const data = await response.json()
          Object.assign(this.authd, data)
          document.cookie = `crate_guide_jwt=${this.authd.token}; SameSite=Strict; Secure;`
          crateStore().fetchCrates()
          recordStore().fetchRecords()
          this.setUserTheme(this.authd.settings.theme)
        } else if (response.status === 401) {
          const error = await response.json()
          this.errorMsg = error.message ? error.message : "Unexpected error"
        }
        this.loading = false
        return response.status
      } catch (error) {
        this.errorMsg = "Unexpected error. Probably network error."
        this.loading = false
        return null
      }
    },

    async addUser(user: UnregisteredUser): Promise<number | null> {
      this.loading = true
      this.errorMsg = ""
      try {
        const response = await userService.addUser(user)
        if (response.status === 201) {
          const data = await response.json()
          const registeringUser: User = {
            _id: data._id,
            discogsUsername: "",
            isDiscogsOAuthd: data.isDiscogsOAuthd,
            isSpotifyOAuthd: data.isSpotifyOAuthd,
            token: data.token,
            name: data.name,
            email: data.email,
            justCompleteDiscogsOAuth: false,
            settings: {
              theme: data.settings.theme,
              turntableTheme: data.settings.turntableTheme,
              turntablePitchRange: data.settings.turntablePitchRange,
              selectedCrate: "all",
              keyFormat: "key",
              listLayout: 0,
            },
          }
          Object.assign(this.authd, registeringUser)
          this.signUpModal = false
        } else if (response.status === 409) {
          this.errorMsg = "An account with that email already exists."
        } else {
          const error = await response.json()
          this.errorMsg = error.message ? error.message : "Unexpected error"
        }
        this.loading = false
        return response.status
      } catch (error) {
        this.errorMsg = "Unexpected error. Probably network error."
        this.loading = false
        return null
      }
    },

    async updateSettings(): Promise<number | null> {
      this.success = false
      this.loading = true
      this.errorMsg = ""
      try {
        const response = await userService.updateSettings(this.authd)
        if (response.status === 200) {
          this.success = true
        } else {
          const error = await response.json()
          this.errorMsg = error.message ? error.message : "Unexpected error"
        }
        this.loading = false
        return response.status
      } catch (error) {
        this.errorMsg = "Unexpected error. Probably network error."
        this.loading = false
        return null
      }
    },

    async forgotPasword(email: string): Promise<number | null> {
      this.success = false
      this.loading = true
      this.errorMsg = ""
      try {
        const response = await userService.forgotPassword(email)
        if (response.status === 200) {
          this.success = true
        } else {
          const error = await response.json()
          this.errorMsg = error.message ? error.message : "Unexpected error"
        }
        this.loading = false
        return response.status
      } catch (error) {
        this.errorMsg = "Unexpected error. Probably network error."
        this.loading = false
        return null
      }
    },

    async resetPassword(password: string): Promise<number | null> {
      this.success = false
      this.loading = true
      this.errorMsg = ""
      try {
        const response = await userService.resetPassword(
          password,
          this.resetToken
        )
        if (response.status === 200) {
          this.success = true
          this.setUserAndFetchData(await response.json())
        } else {
          const error = await response.json()
          this.errorMsg = error.message ? error.message : "Unexpected error"
        }
        this.loading = false
        return response.status
      } catch (error) {
        this.errorMsg = "Unexpected error. Probably network error."
        this.loading = false
        return null
      }
    },

    setUserTheme(theme: string) {
      const root = document.querySelector(":root")
      switch (theme) {
        case "light":
          root!.classList.remove("dark")
          root!.classList.remove("contrast")
          root!.classList.add("light")
          break
        case "dark":
          root!.classList.remove("light")
          root!.classList.remove("contrast")
          root!.classList.add("dark")
          break
        case "contrast":
          root!.classList.remove("light")
          root!.classList.remove("dark")
          root!.classList.add("contrast")
          break
      }
    },

    setUserAndFetchData(user: User) {
      Object.assign(this.authd, user)
      document.cookie = `crate_guide_jwt=${this.authd.token}; SameSite=Strict; Secure;`
      crateStore().fetchCrates()
      recordStore().fetchRecords()
      this.setUserTheme(this.authd.settings.theme)
      this.loginModal = false
      crateStore().fetchCrates()
      recordStore().fetchRecords()
    },

    logout() {
      this.$reset()
      document.cookie = `crate_guide_jwt=0; SameSite=Strict; Secure;max-age=0`
      this.setUserTheme("light")
      crateStore().$reset()
      discogsStore().$reset()
      recordStore().$reset()
      sessionStore().$reset()
      trackStore().$reset()
    },
  },
})
