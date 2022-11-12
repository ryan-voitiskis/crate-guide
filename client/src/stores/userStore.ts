import { defineStore } from "pinia"
import { crateStore } from "@/stores/crateStore"
import { recordStore } from "@/stores/recordStore"
import UnregisteredUser from "@/interfaces/UnregisteredUser"
import User from "@/interfaces/User"
import userService from "@/services/userService"

export const userStore = defineStore("user", {
  state: () => ({
    authd: {
      _id: "",
      name: "",
      email: "",
      token: "", // token for crate guide protected api routes
      discogsUsername: "", // users discogs user id
      settings: {
        theme: "light",
        turntableTheme: "silver",
        turntablePitchRange: "8",
        selectedCrate: "all",
        keyFormat: "key",
        listLayout: 0,
      },
    } as User,
    loading: false, // used in LoginForm, SignUpForm and SettingsForm
    errorMsg: "", // used in LoginForm, SignUpForm and SettingsForm
    invalidCreds: false, // used in LoginForm
    success: false, // used in SettingsForm
    authDiscogs: false, // displays AuthoriseDiscogs.vue
    loginModal: false, // displays LoginForm.vue
    signUpModal: false, // displays SignUpForm.vue
    recoveryModal: false, // displays RecoveryForm.vue
    settingsModal: false, // displays SettingsForm.vue
  }),
  actions: {
    async login(email: string, password: string): Promise<number | null> {
      this.invalidCreds = false
      this.loading = true
      this.errorMsg = ""
      try {
        const response = await userService.login(email, password)
        if (response.status === 200) {
          // nav to home page here to avoid extra call to user.updateSettings() from watch in CollectionManager
          // * this wont be necessary if entry to app requires login. ie collection and session not accessible unless logged in
          // router.push("/")
          const data = await response.json()
          Object.assign(this.authd, data)
          document.cookie = `crate_guide_jwt=${this.authd.token}; SameSite=Strict; Secure;`
          const crates = crateStore()
          const records = recordStore()
          crates.fetchCrates()
          records.fetchRecords()
          this.loading = false
          return response.status

          // handle invalid credentials
        } else if (response.status === 401) {
          this.invalidCreds = true
          this.errorMsg = "Invalid credentials"
        }
        this.loading = false
        return response.status

        // catch error, eg. NetworkError. console.error(error) to debug
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
          // nav to home page here to avoid extra call to user.updateSettings() from watch in CollectionManager
          // * this wont be necessary if entry to app requires login. ie collection and session not accessible unless logged in
          // router.push("/") this prevented handling of url query msg in App
          const data = await response.json()
          Object.assign(this.authd, data)
          document.cookie = `crate_guide_jwt=${this.authd.token}; SameSite=Strict; Secure;`
          crateStore().fetchCrates()
          recordStore().fetchRecords()
          this.loading = false
          return response.status

          // handle invalid credentials
        } else if (response.status === 401) {
          const error = await response.json()
          this.errorMsg = error.message ? error.message : "Unexpected error"
        }
        this.loading = false
        return response.status

        // catch error, eg. NetworkError. console.error(error) to debug
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

        // assign returned user data to state
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
          this.loading = false
          return response.status

          // handle duplicate email
        } else if (response.status === 409) {
          this.errorMsg = "An account with that email already exists."

          // handle other errors
        } else if (response.status === 400) {
          const error = await response.json()
          this.errorMsg = error.message ? error.message : "Unexpected error"
        }
        this.loading = false
        return response.status

        // catch error, eg. NetworkError. console.error(error) to debug
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

        // handle successful update
        if (response.status === 200) this.success = true
        // handle 400 and 401 status codes. see userController.ts
        else {
          const error = await response.json()
          this.errorMsg = error.message ? error.message : "Unexpected error"
        }
        this.loading = false
        return response.status

        // catch error, eg. NetworkError. console.error(error) to debug
      } catch (error) {
        this.errorMsg = "Unexpected error. Probably network error."
        this.loading = false
        return null
      }
    },

    hasUser(): boolean {
      return this.authd._id !== ""
    },
  },
})
