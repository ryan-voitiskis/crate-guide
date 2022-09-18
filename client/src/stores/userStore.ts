import { defineStore } from "pinia"
import User from "@/interfaces/User"
import userService from "@/services/userService"
import discogsService from "@/services/discogsService"
import UnregisteredUser from "@/interfaces/UnregisteredUser"
import router from "@/router"

export const userStore = defineStore("user", {
  state: () => ({
    authd: {
      _id: "",
      name: "",
      email: "",
      token: "", // token for crate guide protected api routes
      discogsUID: "", // users discogs user id
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
    error: false, // used in SettingsForm
    success: false, // used in SettingsForm
    enterDiscogsUsername: false, // displays AuthoriseDiscogs.vue
    authDiscogs: false, // displays AuthoriseDiscogs.vue
    authDiscogsSuccess: false, // displays AuthoriseSuccessful.vue
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
          // ? can this be avoided?
          router.push("/")
          const data = await response.json()
          Object.assign(this.authd, data)
          this.loading = false
          return response.status

          // handle invalid credentials
        } else if (response.status === 401) {
          this.invalidCreds = true
          this.errorMsg = "Invalid credentials"
        }
        this.loading = false
        return response.status

        // catch error, eg. NetworkError
      } catch (error) {
        this.errorMsg = "Unexpected error (Network error?)"
        console.error(error)
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
            discogsUID: "",
            discogsToken: "",
            discogsTokenSecret: "",
            name: data.name,
            email: data.email,
            token: data.token,
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
          const msg = error.message ? error.message : "Unexpected error"
          this.errorMsg = msg
        }
        this.loading = false
        return response.status

        // catch error, eg. NetworkError
      } catch (error) {
        this.errorMsg = "Unexpected error (Network error?)"
        console.error(error)
        this.loading = false
        return null
      }
    },

    async updateSettings(): Promise<number | null> {
      this.success = false
      this.error = false
      this.loading = true
      this.errorMsg = ""
      try {
        const response = await userService.updateSettings(this.authd)

        // handle successful update
        if (response.status === 200) this.success = true
        // handle 400 and 401 status codes. see userController.js
        else {
          this.error = true
          const error = await response.json()
          const msg = error.message ? error.message : "Unexpected error"
          console.error(msg)
        }
        this.loading = false
        return response.status

        // catch error, eg. NetworkError
      } catch (error) {
        this.errorMsg = "Unexpected error (Network error?)"
        this.error = true
        console.error(error)
        this.loading = false
        return null
      }
    },

    async discogsRequestToken(): Promise<number | null> {
      this.error = false
      this.loading = true
      this.errorMsg = ""
      try {
        const response = await discogsService.requestToken(this.authd.token)
        // handle successful update
        if (response.status === 200) {
          const res = await response.json()
          window.location.href = `https://discogs.com/oauth/authorize?oauth_token=${res}`
        }
        // handle 400 and 401 status codes. see userController.js
        else {
          this.error = true
          const error = await response.json()
          const msg = error.message ? error.message : "Unexpected error"
          console.error(msg)
          this.loading = false // not for 200 res as redirect takes time
        }
        return response.status
        // catch error, eg. NetworkError
      } catch (error) {
        this.errorMsg = "Unexpected error (Network error?)"
        this.error = true
        console.error(error)
        this.loading = false
        return null
      }
    },

    hasUser(): boolean {
      return this.authd._id !== ""
    },
  },
})
