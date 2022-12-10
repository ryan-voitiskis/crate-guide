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
import { defineProps, computed } from "vue"
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

const alreadyPlayedFilteredTracks = computed((): TrackPlus[] | null => {
  if (bpmRangeFilteredTracks.value) {
    if (session.transitionHistory.length) {
      const playedTracks = session.transitionHistory.map((i) => i._id)
      return bpmRangeFilteredTracks.value.filter(
        (i) => !playedTracks.includes(i._id)
      )
    } else return bpmRangeFilteredTracks.value
  } else return null
})

const sameRecordFilteredTracks = computed(
  (): TrackPlus[] | null =>
    alreadyPlayedFilteredTracks.value?.filter(
      (i) => i.recordID !== session.decks[props.deckID].loadedTrack?.recordID
    ) || null
)

const tempoScoredTracks = computed((): TrackScored[] | null =>
  sameRecordFilteredTracks.value && session.decks[props.deckID].adjustedBpm
    ? sameRecordFilteredTracks.value.map((i) => ({
        ...i,
        tempoScore: {
          pitchAdjustment:
            (1 - session.decks[props.deckID].adjustedBpm! / i.bpmFinal!) * -1,
          tempoCloseness:
            1 -
            (Math.abs(
              1 - session.decks[props.deckID].adjustedBpm! / i.bpmFinal!
            ) *
              100) /
              user.authd.settings.turntablePitchRange,
        },
      }))
    : null
)

const keyScoredTracks = computed((): TrackScored[] | null =>
  tempoScoredTracks.value && session.decks[props.deckID].loadedTrack?.keyFinal
    ? tempoScoredTracks.value.map((i) => {
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
              harmonyScore: scoreHarmony(
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
              harmonyScore: {
                harmonicAffinity: 0,
                keyCombination: -1,
              },
            }
      })
    : null
)

const suggestions = computed((): TrackScored[] | null =>
  keyScoredTracks.value
    ? [...keyScoredTracks.value]
        .sort(sortNumWithNull2Deep("harmonyScore", "harmonicAffinity", true))
        .slice(0, 50)
    : null
)
</script>

<style scoped lang="scss">
.suggestion-list {
  margin-top: 12px;
  overflow-y: scroll;
  width: 900px;
  height: calc(100% - 688px);
}

@media (max-width: 1846px) {
  .suggestion-list {
    margin: 0 auto;
  }
}
</style>
