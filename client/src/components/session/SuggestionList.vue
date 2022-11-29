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
import { reactive, defineProps, computed } from "vue"
import { sessionStore } from "@/stores/sessionStore"
import { trackStore } from "@/stores/trackStore"
import { userStore } from "@/stores/userStore"
import SuggestionSingle from "@/components/session/SuggestionSingle.vue"
import { TrackPlus, TrackScored } from "@/interfaces/Track"
import { adjustKey, scoreHarmony } from "@/utils/keyFunctions"
import { sortNumWithNull2Deep } from "@/utils/sortFunctions"
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
  return tracks.crateTrackList.filter((i) => {
    if (!i.bpmFinal) return false
    if (
      i.bpmFinal * (-0.01 * user.authd.settings.turntablePitchRange + 1) <
        session.decks[props.deckID].adjustedBpm! &&
      session.decks[props.deckID].adjustedBpm! <
        i.bpmFinal * (0.01 * user.authd.settings.turntablePitchRange + 1)
    )
      return true
    else return false
  })
})

const sameRecordFilteredTracks = computed(
  (): TrackPlus[] | null =>
    bpmRangeFilteredTracks.value?.filter(
      (i) => i.recordID !== session.decks[props.deckID].loadedTrack?.recordID
    ) || null
)

const keyScoredTracks = computed((): TrackScored[] | null =>
  sameRecordFilteredTracks.value &&
  session.decks[props.deckID].loadedTrack?.keyFinal
    ? sameRecordFilteredTracks.value.map((i) => {
        const keyAdjusted =
          i.bpmFinal && i.keyFinal && session.decks[props.deckID].adjustedBpm
            ? adjustKey(
                i.keyFinal.key,
                session.decks[props.deckID].adjustedBpm! / i.bpmFinal
              )
            : null
        return typeof keyAdjusted === "number" &&
          typeof session.decks[props.deckID].adjustedKey === "number" &&
          i.keyFinal
          ? {
              ...i,
              score: scoreHarmony(
                {
                  key: session.decks[props.deckID].adjustedKey!,
                  mode: session.decks[props.deckID].loadedTrack!.keyFinal!
                    .mode!,
                },
                { key: keyAdjusted, mode: i.keyFinal.mode }
              ),
            }
          : {
              ...i,
              score: {
                closeness: 0,
                combination: -1,
              },
            }
      })
    : null
)

const suggestions = computed((): TrackScored[] | null =>
  keyScoredTracks.value
    ? [...keyScoredTracks.value]
        .sort(sortNumWithNull2Deep("score", "closeness", true))
        .slice(0, 50)
    : null
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
