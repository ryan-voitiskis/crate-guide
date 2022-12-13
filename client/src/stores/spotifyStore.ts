import { defineStore } from "pinia"
import { fetchEventSource } from "@microsoft/fetch-event-source"
import { InexactAlbumMatch } from "@/interfaces/InexactAlbumMatch"
import { InexactTrackMatch } from "@/interfaces/InexactTrackMatch"
import { recordStore } from "@/stores/recordStore"
import { userStore } from "@/stores/userStore"
import MatchedTrack from "@/interfaces/MatchedTrack"
import spotifyService from "@/services/spotifyService"
import globals from "@/globals"

export const spotifyStore = defineStore("spotify", {
  state: () => ({
    importProgress: 0,
    errorMsg: "",
    loading: false,
    importProgressModal: false, // displays SpotifyImportProgress.vue
    albumMatchesModal: false, // displays AlbumMatchForm.vue
    trackMatchesModal: false, // displays TrackMatchForm.vue
    completionModal: false, // displays SpotifyCompletion.vue
    revokeSpotifyModal: false, // displays ComfirmRevokeSpotify.vue
    inexactAlbumMatches: [] as InexactAlbumMatch[], // records attempted to be found on spotify w/o perfect match
    inexactTrackMatches: [] as InexactTrackMatch[],
  }),
  actions: {
    async authorisationRequest(): Promise<number | null> {
      this.loading = true
      this.errorMsg = ""
      const user = userStore()
      try {
        const response = await spotifyService.authorisationRequest(
          user.authd.token
        )
        if (response.status === 200) {
          const res = await response.json()
          window.location.href = res
        } else {
          const error = await response.json()
          this.errorMsg = error.message ? error.message : "Unexpected error"
          this.loading = false
        }
        return response.status
      } catch (error) {
        this.errorMsg = "Unexpected error. Probably network error."
        this.loading = false
        return null
      }
    },

    async revokeAuthorisation(): Promise<number | null> {
      this.loading = true
      this.errorMsg = ""
      const user = userStore()
      try {
        const response = await spotifyService.revokeAuthorisation(
          user.authd.token
        )
        if (response.status === 200) {
          user.authd.isSpotifyOAuthd = false
          this.revokeSpotifyModal = false
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

    async getTrackFeatures(track: MatchedTrack): Promise<number | null> {
      this.errorMsg = ""
      try {
        const response = await spotifyService.getTrackFeatures(
          track,
          userStore().authd.token
        )
        if (response.status === 200) return response.status
        else {
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

    async importDataForSelectedRecords() {
      this.errorMsg = ""
      this.importProgressModal = true
      this.inexactAlbumMatches = []
      this.inexactTrackMatches = []
      const records = recordStore()
      const body = new URLSearchParams()
      body.append("records", JSON.stringify(records.checkboxed))

      const setProgress = (progress: number) => (this.importProgress = progress)

      const handleError = (msg: string) =>
        (this.errorMsg = msg ? msg.replace("Error: ", "") : "Unexpected error")

      const handleJSON = (data: string) => {
        this.importProgress = 1
        records.checkboxed = []
        this.importProgressModal = false // see note #1 at end of file
        const receivedObj = JSON.parse(data.substring(data.indexOf(":") + 1))
        this.inexactAlbumMatches = receivedObj.inexactAlbumMatches
        this.inexactTrackMatches = receivedObj.inexactTrackMatches
        if (this.inexactAlbumMatches.length) this.albumMatchesModal = true
        else if (this.inexactTrackMatches.length) this.trackMatchesModal = true
        this.importProgress = 0
      }

      const handleCompletion = async () => {
        this.loading = true
        records.checkboxed = []
        await records.fetchRecords()
        this.importProgressModal = false
        this.importProgress = 0
        this.loading = false
        this.completionModal = true
      }

      if (records.checkboxed.length) {
        try {
          await fetchEventSource(
            globals.API_SPOTIFY_SSE_URL + "import_selected",
            {
              method: "POST",
              headers: {
                Accept: "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
                Authorization: `Bearer ${userStore().authd.token}`,
              },
              body: body,
              onmessage(msg) {
                if (msg.data.startsWith("Error")) handleError(msg.data)
                else if (msg.data.startsWith("json")) handleJSON(msg.data)
                else {
                  const progress = parseFloat(msg.data)
                  setProgress(progress)
                  if (progress === 1) handleCompletion()
                }
              },
              onerror(err) {
                console.error(err)
                handleError(err)
              },
              openWhenHidden: true, //! request resent on tab activated if not specified
            }
          )
        } catch (error) {
          console.error(error)
        }
      } else {
        this.importProgressModal = false
      }
    },

    async importSelectedInexactMatches() {
      this.albumMatchesModal = false
      this.trackMatchesModal = false
      this.errorMsg = ""
      this.importProgressModal = true
      const records = recordStore()
      const body = new URLSearchParams()
      const matchedAlbums = this.getMatchedInexactAlbums()
      const matchedTracks = this.getMatchedInexactTracks()
      const unmatchedAlbums = this.getUnmatchedInexactAlbums()
      body.append("matchedAlbums", JSON.stringify(matchedAlbums))
      body.append("matchedTracks", JSON.stringify(matchedTracks))
      body.append("unmatchedAlbums", JSON.stringify(unmatchedAlbums))
      this.inexactAlbumMatches = []
      this.inexactTrackMatches = []

      const setProgress = (progress: number) => (this.importProgress = progress)

      const handleError = (msg: string) =>
        (this.errorMsg = msg ? msg.replace("Error: ", "") : "Unexpected error")

      const handleJSON = (data: string) => {
        this.importProgress = 1
        records.checkboxed = []
        this.importProgressModal = false // see note #2 at end of file
        const receivedObj = JSON.parse(data.substring(data.indexOf(":") + 1))
        this.inexactTrackMatches = receivedObj.inexactTrackMatches
        if (this.inexactTrackMatches.length) this.trackMatchesModal = true
        this.importProgress = 0
      }

      const handleCompletion = async () => {
        this.loading = true
        records.checkboxed = []
        await records.fetchRecords()
        this.importProgressModal = false
        this.importProgress = 0
        this.loading = false
        this.completionModal = true
      }

      try {
        await fetchEventSource(globals.API_SPOTIFY_SSE_URL + "import_matched", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Bearer ${userStore().authd.token}`,
          },
          body: body,
          onmessage(msg) {
            if (msg.data.startsWith("Error")) handleError(msg.data)
            else if (msg.data.startsWith("json")) handleJSON(msg.data)
            else {
              const progress = parseFloat(msg.data)
              setProgress(progress)
              if (progress === 1) handleCompletion()
            }
          },
          onerror(err) {
            console.error(err)
            handleError(err)
          },
          openWhenHidden: true, //! request resent on tab activated if not specified
        })
      } catch (error) {
        console.error(error)
      }
    },

    // selects or deselects InexactMatchesOption. if selecting, also deselects all other options
    // works like radio buttons but can also deselect, so that none are selected
    toggleInexactAlbumOption(recordID: string, optionID: string) {
      const inexactMatch = this.inexactAlbumMatches.find(
        (i) => i.recordID === recordID
      )
      if (inexactMatch) {
        const inexactMatchOption = inexactMatch.matches.find(
          (i) => i.id === optionID
        )
        if (inexactMatchOption) {
          if (!inexactMatchOption.selected) {
            inexactMatch.matches.forEach((i) => {
              i.selected = false
            })
            inexactMatchOption.selected = !inexactMatchOption.selected
          } else
            inexactMatch.matches.forEach((i) => {
              i.selected = false
            })
        }
      }
    },

    // works like toggleInexactAlbumOption for tracks
    toggleInexactTrackOption(trackID: string, optionID: string) {
      const inexactMatch = this.inexactTrackMatches.find(
        (i) => i.trackID === trackID
      )
      if (inexactMatch) {
        const inexactMatchOption = inexactMatch.options.find(
          (i) => i.id === optionID
        )
        if (inexactMatchOption) {
          if (!inexactMatchOption.selected) {
            inexactMatch.options.forEach((i) => {
              i.selected = false
            })
            inexactMatchOption.selected = !inexactMatchOption.selected
          } else
            inexactMatch.options.forEach((i) => {
              i.selected = false
            })
        }
      }
    },
  },

  getters: {
    // creates an array of the selected record IDs and corresponding spotify album IDs
    getMatchedInexactAlbums: (state) => {
      return () =>
        state.inexactAlbumMatches
          .filter((i) => i.matches.find((i) => i.selected))
          .map((i) => ({
            recordID: i.recordID,
            album: i.matches.find((i) => i.selected),
          }))
    },
    // creates an array of the Unselected record IDs and corresponding spotify album IDs
    getUnmatchedInexactAlbums: (state) => {
      return () =>
        state.inexactAlbumMatches
          .filter((i) => !i.matches.find((i) => i.selected))
          .map((i) => i.recordID)
    },
    // creates an array of the selected track spotify track IDs with corresponding record and track _id
    getMatchedInexactTracks: (state) => {
      return () =>
        state.inexactTrackMatches
          .filter((i) => i.options.find((i) => i.selected))
          .map((i) => ({
            recordID: i.recordID,
            trackID: i.trackID,
            spotifyTrackID: i.options.find((i) => i.selected)?.id,
          }))
    },
  },
})

// NOTES
// #1 importProgressModal must be closed before inexactAlbumMatches !== [], so document.body.style.overflow = "hidden" from ModalBox hook
// #2 importProgressModal must be closed before inexactTrackMatches !== [], so document.body.style.overflow = "hidden" from ModalBox hook
