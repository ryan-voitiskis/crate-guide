<template>
  <div class="suggestion-list">
    <SuggestionSingle
      v-for="track in suggestions"
      :track="track"
      :key="track._id"
      :deckID="deckID"
    />
  </div>
</template>

<script setup lang="ts">
import { reactive, defineProps, computed, Ref, ref } from "vue"
import { sessionStore } from "@/stores/sessionStore"
import { trackStore } from "@/stores/trackStore"
import { userStore } from "@/stores/userStore"
import SuggestionSingle from "@/components/session/SuggestionSingle.vue"
import { TrackPlus } from "@/interfaces/Track"
import unsign from "@/utils/unsign"
const session = sessionStore()
const tracks = trackStore()
const user = userStore()

const props = defineProps<{
  deckID: number
}>()

const state = reactive({})

const bpmRangeFilteredTracks = computed((): TrackPlus[] | null => {
  if (!session.decks[props.deckID].loadedTrack) return null
  if (!session.decks[props.deckID].loadedTrack?.bpmFinal)
    return tracks.crateTrackList
  const adjustedLoadedBpm =
    (session.decks[props.deckID].pitch *
      0.0001 *
      +user.authd.settings.turntablePitchRange +
      1) *
    session.decks[props.deckID].loadedTrack!.bpmFinal!
  return tracks.crateTrackList.filter((i) => {
    if (!i.bpmFinal) return false
    if (
      i.bpmFinal * (-0.01 * +user.authd.settings.turntablePitchRange + 1) <
        adjustedLoadedBpm &&
      adjustedLoadedBpm <
        i.bpmFinal * (0.01 * +user.authd.settings.turntablePitchRange + 1)
    )
      return true
    else return false
  })
})

const suggestions = computed(
  (): TrackPlus[] | null => bpmRangeFilteredTracks.value
)
</script>

<style scoped lang="scss">
.suggestion-list {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  width: 900px;
}
</style>
