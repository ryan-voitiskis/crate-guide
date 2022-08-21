import { defineStore } from "pinia"
import User from "@/interfaces/User"
import userService from "@/services/userService"
import UnregisteredUser from "@/interfaces/UnregisteredUser"
import router from "@/router"

export const userStore = defineStore("user", {
  state: () => ({
    loggedIn: {
      _id: "",
      name: "",
      email: "",
      token: "",
      settings: {
        theme: "light",
        turntableTheme: "silver",
        turntablePitchRange: "8",
        selectedCrate: "all",
      },
    } as User,
    duplicateEmail: false, // used in SignUpForm
    invalidCreds: false, // used in LoginForm
    loading: false, // used in LoginForm, SignUp and SettingsForm
    error: false, // used in SettingsForm
    success: false, // used in SettingsForm
    errorMsg: "", // used in SignUpForm
  }),
  actions: {
    async login(email: string, password: string): Promise<number> {
      this.invalidCreds = false
      this.loading = true
      this.errorMsg = ""
      try {
        const response = await userService.login(email, password)
        if (response.status === 200) {
          // nav to home page here to avoid extra call to user.updateSettings() from watch in CollectionManager
          router.push("/")
          const data = await response.json()
          const authenticatedUser: User = {
            _id: data._id,
            name: data.name,
            email: data.email,
            token: data.token,
            settings: {
              theme: data.settings.theme,
              turntableTheme: data.settings.turntableTheme,
              turntablePitchRange: data.settings.turntablePitchRange,
              selectedCrate: data.settings.selectedCrate,
            },
          }
          Object.assign(this.loggedIn, authenticatedUser)
          this.loading = false
          return response.status

          // handle invalid credentials
        } else if (response.status === 400) {
          this.invalidCreds = true
          this.errorMsg = "Invalid credentials"
          this.loading = false
          const error = await response.json()
          console.error("userStore.login():", error.message)
        }
        return response.status

        // catch error, eg. TypeError: NetworkError when attempting to fetch resource.
      } catch (error) {
        this.errorMsg = "Unexpected error"
        this.loading = false
        console.error(error)
        return 400
      }
    },

    async addUser(user: UnregisteredUser): Promise<number> {
      this.loading = true
      this.duplicateEmail = false
      this.errorMsg = ""
      try {
        const response = await userService.addUser(user)

        // assign returned user data to state
        if (response.status === 201) {
          const data = await response.json()
          const registeringUser: User = {
            _id: data._id,
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
          Object.assign(this.loggedIn, registeringUser)
          this.loading = false
          return response.status

          // handle duplicate email
        } else if (response.status === 409) {
          this.duplicateEmail = true
          this.loading = false
          const error = await response.json()
          console.error("userStore.addUser():", error.message)

          // handle other errors
        } else if (response.status === 400) {
          this.loading = false
          const error = await response.json()
          this.errorMsg = error.message
          console.error("userStore.addUser():", error.message)
        }
        return response.status

        // catch error, eg. TypeError: NetworkError when attempting to fetch resource.
        // TODO: represent this type of error in UI
      } catch (error) {
        this.errorMsg = "Unexpected error"
        this.loading = false
        console.error(error)
        return 400
      }
    },

    async updateSettings(): Promise<number> {
      this.success = false
      this.error = false
      this.loading = true

      try {
        const response = await userService.updateSettings(this.loggedIn)

        // handle successful update
        if (response.status === 200) {
          this.success = true

          // handle 400 and 401 status codes. see userController.js
        } else {
          this.error = true
          const error = await response.json()
          console.error("userStore.updateSettings():", error.message)
        }
        this.loading = false
        return response.status

        // catch error, eg. TypeError: NetworkError when attempting to fetch resource.
        // TODO: represent this type of error in UI, test by changing server port in userService
      } catch (error) {
        console.error(error)
        this.loading = false
        return 400
      }
    },

    hasUser(): boolean {
      return this.loggedIn._id !== ""
    },
  },
})
