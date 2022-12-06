import { TrackPlus } from "@/interfaces/Track"
import { defineStore } from "pinia"
import { trackStore } from "@/stores/trackStore"
import { userStore } from "./userStore"
import PlayedTrack from "@/interfaces/PlayedTrack"

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
      },
    ] as Deck[],
    history: [] as PlayedTrack[],
    loadTrackTo: -1, // deck number to load track to
    confirmClearHistory: false,
    collapseHeader: false,
  }),
  actions: {
    loadTrack(_id: string, to: number, matchTempo?: boolean) {
      this.decks[to].loadedTrack =
        trackStore().getTrackByIdFromCrateTrackList(_id)
      let otherBpm = null
      if (matchTempo) {
        otherBpm = this.decks[to === 1 ? 0 : 1].adjustedBpm
        if (otherBpm && this.decks[to].loadedTrack!.bpmFinal) {
          const pitch =
            ((otherBpm / this.decks[to].loadedTrack!.bpmFinal! - 1) /
              (userStore().authd.settings.turntablePitchRange / 100)) *
            100
          this.decks[to].faderPosition = pitch
          this.decks[to].pitch = pitch
        }
      }
      this.history.push({
        _id: _id,
        timeAdded: Date.now(),
        adjustedBpm: otherBpm,
        transitionFromRating: null,
      })
    },
  },
  getters: {},
})
