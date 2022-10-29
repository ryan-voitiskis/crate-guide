import { defineStore } from "pinia"
import { userStore } from "@/stores/userStore"
import { recordStore } from "@/stores/recordStore"
import { fetchEventSource } from "@microsoft/fetch-event-source"
import spotifyService from "@/services/spotifyService"
import { ImperfectMatch } from "@/interfaces/ImperfectMatch"

// todo: make global or do something better
const API_SSE_URL = "http://localhost:5001/api/spotify_sse/"

export const spotifyStore = defineStore("spotify", {
  state: () => ({
    importProgress: 0,
    errorMsg: "",
    loading: false,
    importProgressModal: false,
    imperfectAlbumMatches: [] as ImperfectMatch[], // records attempted to be found on spotify w/o perfect match
    noMatches: [] as string[], // records attempted to be found on spotify w/o any match
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

    async importDataForSelectedRecords(token: string) {
      this.errorMsg = ""
      this.importProgressModal = true
      this.imperfectAlbumMatches = []
      this.noMatches = []
      const records = recordStore()
      const body = new URLSearchParams()
      body.append("records", JSON.stringify(records.checkboxed))

      const setProgress = (progress: number) => (this.importProgress = progress)

      const handleError = (msg: string) =>
        (this.errorMsg = msg ? msg.replace("Error: ", "") : "Unexpected error")

      const handleJSON = (data: string) => {
        this.importProgress = 1
        records.checkboxed = []
        // modal must be closed before imperfectAlbumMatches !== [], so document.body.style.overflow = "hidden" from ModalBox hook
        this.importProgressModal = false
        const receivedObj = JSON.parse(data.substring(data.indexOf(":") + 1))
        this.imperfectAlbumMatches = receivedObj.imperfectAlbumMatches
        this.noMatches = receivedObj.noMatches
        this.importProgress = 0
        // this.loading = false // ? maybe not necessary
      }

      const handleCompletion = async () => {
        this.loading = true
        await records.fetchRecords(token)
        this.importProgressModal = false
        this.importProgress = 0
        this.loading = false
      }

      if (records.checkboxed.length) {
        try {
          // fetch SSE request made directly from Store so importProgress can be mutated.
          // spotifyStore cannot be accessed from spotifyService
          await fetchEventSource(API_SSE_URL + "import_data_for_selected", {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/x-www-form-urlencoded",
              Authorization: `Bearer ${token}`,
            },
            body: body,
            onmessage(msg) {
              if (msg.data.startsWith("Error")) handleError(msg.data)
              else if (msg.data.startsWith("json")) handleJSON(msg.data)
              const progress = parseFloat(msg.data)
              setProgress(progress)
              if (progress === 1) handleCompletion()
            },
            onerror(err) {
              console.error(err)
              handleError(err)
            },
          })

          // catch error, eg. NetworkError. console.error(error) to debug
        } catch (error) {
          console.error(error)
        }
      } else {
        this.importProgressModal = false
      }
    },

    async importSelectedImperfectMatches(token: string) {
      // this.errorMsg = ""
      // this.importProgressModal = true
      // const records = recordStore()
      // const body = new URLSearchParams()
      // body.append("records", JSON.stringify(records.checkboxed))
      // const setProgress = (progress: number) => (this.importProgress = progress)
      // const handleError = (msg: string) =>
      //   (this.errorMsg = msg ? msg.replace("Error: ", "") : "Unexpected error")
      // const handleCompletion = async () => {
      //   this.loading = true
      //   await records.fetchRecords(token)
      //   this.importProgressModal = false
      //   this.importProgress = 0
      //   this.loading = false
      // }
      // if (records.checkboxed.length) {
      //   try {
      //     // fetch SSE request made directly from Store so importProgress can be mutated.
      //     // spotifyStore cannot be accessed from spotifyService
      //     await fetchEventSource(API_SSE_URL + "import_data_for_selected", {
      //       method: "POST",
      //       headers: {
      //         Accept: "application/json",
      //         "Content-Type": "application/x-www-form-urlencoded",
      //         Authorization: `Bearer ${token}`,
      //       },
      //       body: body,
      //       onmessage(msg) {
      //         if (msg.data.includes("Error")) handleError(msg.data)
      //         const progress = parseFloat(msg.data)
      //         setProgress(progress)
      //         if (progress === 1) handleCompletion()
      //       },
      //       onerror(err) {
      //         console.error(err)
      //         handleError(err)
      //       },
      //     })
      //     // catch error, eg. NetworkError. console.error(error) to debug
      //   } catch (error) {
      //     console.error(error)
      //   }
      // } else {
      //   this.importProgressModal = false
      // }
    },

    // selects or deselects ImperfectMatchesOption. if selecting, also deselects all other options
    // works like radio buttons but can also deselect, so that none are selected
    toggleImperfectMatchesOption(recordID: string, optionID: string) {
      const imperfectMatch = this.imperfectAlbumMatches.find(
        (i) => i._id === recordID
      )
      if (imperfectMatch) {
        const imperfectMatchOption = imperfectMatch.matches.find(
          (i) => i.id === optionID
        )
        if (imperfectMatchOption) {
          if (!imperfectMatchOption.selected) {
            imperfectMatch.matches.forEach((i) => {
              i.selected = false
            })
            imperfectMatchOption.selected = !imperfectMatchOption.selected
          } else
            imperfectMatch.matches.forEach((i) => {
              i.selected = false
            })
        }
      }
    },
  },
  getters: {},
})
