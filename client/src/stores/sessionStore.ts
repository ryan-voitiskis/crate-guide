import { TrackPlus } from "@/interfaces/Track"
import { defineStore } from "pinia"
import { trackStore } from "@/stores/trackStore"
import { userStore } from "./userStore"
import PlayedTrack from "@/interfaces/PlayedTrack"
import sessionService from "@/services/sessionService"
import Set from "@/interfaces/Set"
import UnsavedSet from "@/interfaces/UnsavedSet"

interface Deck {
  loadedTrack: TrackPlus | null
  playing: boolean
  rpm: number
  faderPosition: number
  pitch: number // range of -100 (-8% of rpm) to 100 (+8% of rpm)
  tappedBpm: number | null
  adjustedBpm: number | null
  adjustedBpmReadable: number | null
  adjustedKey: number | null
  faderSliding: boolean
}

export const sessionStore = defineStore("session", {
  state: () => ({
    decks: [
      {
        loadedTrack: null,
        playing: false,
        rpm: 33,
        faderPosition: 0,
        pitch: 0,
        tappedBpm: null,
        adjustedBpm: null,
        adjustedBpmReadable: null,
        adjustedKey: null,
        faderSliding: false,
      },
      {
        loadedTrack: null,
        playing: false,
        rpm: 33,
        faderPosition: 0,
        pitch: 0,
        tappedBpm: null,
        adjustedBpm: null,
        adjustedBpmReadable: null,
        adjustedKey: null,
        faderSliding: false,
      },
    ] as Deck[],
    set: [] as PlayedTrack[],
    savedSets: [] as Set[],
    loadTrackTo: -1, // deck number to load track to
    selectedSetIndex: -1, // index of savedSets to display in SetManager.vue
    setToDelete: "",
    confirmClearHistory: false,
    saveHistoryForm: false, // displays SaveSetForm.vue
    setManager: false, // displays SetManager.vue
    confirmDeleteSet: false, // displays ConfirmDeleteSet.vue
    historyListModal: false, // displays HistoryListModal.vue
    collapseHeader: false,
    errorMsg: "",
    loading: false,
  }),
  actions: {
    loadTrack(_id: string, deckID: number, matchTempo?: boolean) {
      this.decks[deckID].loadedTrack =
        trackStore().getTrackByIdFromCrateTrackList(_id)
      let otherBpm = null
      if (matchTempo) {
        otherBpm = this.decks[deckID === 1 ? 0 : 1].adjustedBpm
        if (otherBpm && this.decks[deckID].loadedTrack!.bpmFinal) {
          const pitch =
            ((otherBpm / this.decks[deckID].loadedTrack!.bpmFinal! - 1) /
              (userStore().authd.settings.turntablePitchRange / 100)) *
            100
          this.slideFader(deckID, pitch)
          this.decks[deckID].pitch = pitch
        }
      }
      this.set.push({
        _id: _id,
        timeAdded: Date.now(),
        adjustedBpm: otherBpm,
        transitionRating: null,
      })
    },

    async slideFader(deckID: number, pitch: number) {
      this.decks[deckID].faderSliding = true
      let current: number = this.decks[deckID].faderPosition
      while (Math.abs(current - pitch) > 3) {
        current = pitch - current > 0 ? +current + 2 : current - 2
        this.decks[deckID].faderPosition = current
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      this.decks[deckID].faderPosition = pitch
      this.decks[deckID].faderSliding = false
    },

    async fetchSets(): Promise<number | null> {
      try {
        const response = await sessionService.getSets(userStore().authd.token)
        if (response.status === 200) {
          const sets = (await response.json()) as Set[]
          if (sets) this.savedSets = sets
        } else {
          const error = await response.json()
          this.errorMsg = error.message ? error.message : "Unexpected error"
        }
        return response.status
      } catch (error) {
        console.error(error)
        return null
      }
    },

    async saveSet(history: UnsavedSet): Promise<number | null> {
      this.loading = true
      this.errorMsg = ""
      try {
        const response = await sessionService.saveSet(
          history,
          userStore().authd.token
        )
        if (response.status === 201) {
          const newSet = (await response.json()) as Set
          this.savedSets.push(newSet)
          this.loading = false
          this.saveHistoryForm = false
          return response.status
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

    async deleteSet(): Promise<number | null> {
      this.loading = true
      this.errorMsg = ""
      try {
        const user = userStore()
        const response = await sessionService.deleteSet(
          this.setToDelete,
          user.authd.token
        )
        if (response.status === 200) {
          this.selectedSetIndex = -1
          this.savedSets = this.savedSets.filter(
            (i) => i._id !== this.setToDelete
          )
          this.setToDelete = ""
          this.confirmDeleteSet = false
          user.authd.settings.selectedCrate = "all"
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
  },
  getters: {},
})
