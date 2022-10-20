import { defineStore } from "pinia"
import { userStore } from "@/stores/userStore"
import { recordStore } from "@/stores/recordStore"
import spotifyService from "@/services/spotifyService"

// todo: make global or do something better
const API_URL = "http://localhost:5001/api/spotify/"

export const spotifyStore = defineStore("spotify", {
  state: () => ({
    errorMsg: "",
    loading: false,
  }),
  actions: {
    // call and handle request that begins spotify OAuth flow
    async authorisationRequest(): Promise<number | null> {
      const user = userStore()
      this.loading = true
      this.errorMsg = ""
      try {
        const response = await spotifyService.authorisationRequest(
          user.authd.token
        )
        // handle successful update
        if (response.status === 200) {
          const res = await response.json()
          window.location.href = res
        }
        // handle 400 status code. see spotifyController.ts
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

    // call and handle response to request that removes spotifyToken, spotifyTokenSecret,
    // spotifyRequestToken and spotifyRequestTokenSecret from user.
    async revokeSpotifyAuthorisation(): Promise<number | null> {
      const user = userStore()
      this.loading = true
      this.errorMsg = ""
      try {
        const response = await spotifyService.revokeSpotifyAuthorisation(
          user.authd.token
        )
        // handle successful update
        if (response.status === 200) {
          // user.authd.isSpotifyOAuthd = false
          // user.authd.spotifyUsername = ""
          // this.revokeSpotifyForm = false
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
  },
  getters: {},
})
