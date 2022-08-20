import { defineStore } from "pinia"
import User from "@/interfaces/User"
import userService from "@/services/userService"
import UnregisteredUser from "@/interfaces/UnregisteredUser"

export const userStore = defineStore("user", {
  state: () => ({
    loggedIn: {
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
    } as User,
    duplicateEmail: false, // only for SignUpForm
    invalidCreds: false, // only for LoginForm
    loading: false, // for LoginForm, SignUp and SettingsForm
    error: false, // only for SettingsForm
    success: false, // only for SettingsForm
    errorMsg: "", // only for SignUpForm
  }),
  actions: {
    async login(email: string, password: string): Promise<number> {
      this.invalidCreds = false
      this.loading = true
      try {
        const response = await userService.login(email, password)
        if (response.status === 200) {
          const data = await response.json()
          const authenticatedUser: User = {
            id: data._id,
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
          this.loading = false
        }
        return response.status

        // catch error
        // ? will this ever get hit if fetch occurs in userService?
      } catch (error) {
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
            id: data._id,
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
          const data = await response.json()
          this.duplicateEmail = true
          this.errorMsg = data.message
          this.loading = false

          // handle other errors
        } else if (response.status === 400) {
          this.errorMsg = "Unexpected error"
          this.loading = false
        }
        return response.status

        // catch error
        // ? will this ever get hit if fetch occurs in userService?
      } catch (error) {
        this.errorMsg = "Unexpected error (2)"
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
          const data = await response.json()
          console.error(data.message)
          this.error = true
        }
        this.loading = false
        return response.status

        // catch error
        // ? will this ever get hit if fetch occurs in userService?
      } catch (error) {
        console.error(error)
        this.loading = false
        return 400
      }
    },

    hasUser(): boolean {
      return this.loggedIn.id !== ""
    },
  },
})
