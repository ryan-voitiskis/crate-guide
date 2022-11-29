import { TrackPlus } from "@/interfaces/Track"
import { defineStore } from "pinia"
import { trackStore } from "@/stores/trackStore"

interface Deck {
  loadedTrack: TrackPlus | null
  playing: boolean
  rpm: number
  pitch: number // range of -100 (-8% of rpm) to 100 (+8% of rpm)
  tappedBpm: number | null
  adjustedBpm: number | null
  adjustedKey: number | null
}

export const sessionStore = defineStore("session", {
  state: () => ({
    decks: [
      {
        loadedTrack: null,
        playing: false,
        rpm: 33,
        pitch: 0,
        tappedBpm: null,
        adjustedBpm: null,
        adjustedKey: null,
      },
      {
        loadedTrack: null,
        playing: false,
        rpm: 33,
        pitch: 0,
        tappedBpm: null,
        adjustedBpm: null,
        adjustedKey: null,
      },
    ] as Deck[],
    loadTrackTo: -1, // deck number to load track to
    collapseHeader: false,
  }),
  actions: {
    loadTrack(_id: string, to: number) {
      this.decks[to].loadedTrack =
        trackStore().getTrackByIdFromCrateTrackList(_id)
    },
  },
  getters: {},
})
