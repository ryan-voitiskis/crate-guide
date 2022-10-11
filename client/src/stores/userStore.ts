import { defineStore } from "pinia"
import User from "@/interfaces/User"
import userService from "@/services/userService"
import discogsService from "@/services/discogsService"
import UnregisteredUser from "@/interfaces/UnregisteredUser"
import router from "@/router"
import { crateStore } from "@/stores/crateStore"
import { recordStore } from "@/stores/recordStore"

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
      },
    } as User,
    loading: false, // used in LoginForm, SignUpForm and SettingsForm
    errorMsg: "", // used in LoginForm, SignUpForm and SettingsForm
    invalidCreds: false, // used in LoginForm
    success: false, // used in SettingsForm
    authDiscogs: false, // displays AuthoriseDiscogs.vue
    revokeDiscogsForm: false, // displays RevokeDiscogsForm.vue
    selectDiscogsFolder: false, // displays SelectDiscogsFolder.vue
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
          router.push("/")
          const data = await response.json()
          Object.assign(this.authd, data)
          document.cookie = `crate_guide_jwt=${this.authd.token}; SameSite=Strict; Secure;`
          const crates = crateStore()
          const records = recordStore()
          crates.fetchCrates(this.authd.token)
          records.fetchRecords(this.authd.token)
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
          router.push("/")
          const data = await response.json()
          Object.assign(this.authd, data)
          document.cookie = `crate_guide_jwt=${this.authd.token}; SameSite=Strict; Secure;`
          const crates = crateStore()
          const records = recordStore()
          crates.fetchCrates(this.authd.token)
          records.fetchRecords(this.authd.token)
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
            token: data.token,
            name: data.name,
            email: data.email,
            justCompleteDiscogsOAuth: false,
            settings: {
              theme: data.settings.theme,
              turntableTheme: data.settings.turntableTheme,
              turntablePitchRange: data.settings.turntablePitchRange,
              selectedCrate: "all",
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

    // call and handle request that begins discogs OAuth flow
    async discogsRequestToken(): Promise<number | null> {
      this.loading = true
      this.errorMsg = ""
      try {
        const response = await discogsService.requestToken(this.authd.token)
        // handle successful update
        if (response.status === 200) {
          const res = await response.json()
          window.location.href = `https://discogs.com/oauth/authorize?oauth_token=${res}`
        }
        // handle 400 status code. see discogsController.ts
        else {
          const error = await response.json()
          this.errorMsg = error.message ? error.message : "Unexpected error"
          this.loading = false // not for 200 res as redirect takes time
        }
        return response.status

        // catch error, eg. NetworkError. console.error(error) to debug
      } catch (error) {
        this.errorMsg = "Unexpected error. Probably network error."
        this.loading = false
        return null
      }
    },

    // call and handle response to request that removes discogsToken, discogsTokenSecret,
    // discogsRequestToken and discogsRequestTokenSecret from user.
    async revokeDiscogsAuthorisation(): Promise<number | null> {
      this.loading = true
      this.errorMsg = ""
      try {
        const response = await discogsService.revokeDiscogsAuthorisation(
          this.authd
        )
        // handle successful update
        if (response.status === 200) {
          this.authd.isDiscogsOAuthd = false
          this.authd.discogsUsername = ""
          this.revokeDiscogsForm = false
        }
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
