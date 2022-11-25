<template>
  <div class="deck-area-container">
    <div class="deck-wrapper">
      <div class="deck">
        <button class="load-track" @click="session.loadTrackTo = deckID">
          LOAD
        </button>
        <div class="t-detail title">
          <span class="position">
            {{ track?.position }}
          </span>
          {{ track?.title }}
        </div>
        <span class="t-detail artist">
          {{ track?.artistsFinal }}
        </span>
        <div class="t-detail album-details">
          <span class="catno">{{ track?.catno }}</span>
          <span class="year">{{ track?.year }}</span>
        </div>
        <span class="t-detail genre">
          {{ track?.genre }}
        </span>
        <span class="t-detail duration" v-if="track?.durationFinal">
          "{{ getDurationString(track.durationFinal) }}"
        </span>
        <span class="t-detail key" v-if="keyString">
          {{ keyString }}
        </span>
        <button
          class="t-detail audio-feature danceability"
          v-if="track?.audioFeatures"
          @click="tracks.toShowFeatures = track?._id || ''"
        >
          <DanceIcon /><span>{{
            getPercent(track.audioFeatures.danceability)
          }}</span>
        </button>
        <button
          class="t-detail audio-feature energy"
          v-if="track?.audioFeatures"
          @click="tracks.toShowFeatures = track?._id || ''"
        >
          <BoltIcon /><span>{{ getPercent(track.audioFeatures.energy) }}</span>
        </button>
        <button
          class="t-detail audio-feature valence"
          v-if="track?.audioFeatures"
          @click="tracks.toShowFeatures = track?._id || ''"
        >
          <SmileIcon /><span>{{
            getPercent(track.audioFeatures.valence)
          }}</span>
        </button>
        <div class="t-detail time-signature" v-if="timeSignature">
          <sup>{{ timeSignature[0] }}</sup>
          <sub>{{ timeSignature[1] }}</sub>
        </div>
        <StartStopButton :deckID="deckID" />
        <RpmSwitch :deckID="deckID" :speed="33" />
        <RpmSwitch :deckID="deckID" :speed="45" />
        <PitchFader :deckID="deckID" />
        <RecordIcon :deckID="deckID" />
        <BPMTapper :deckID="deckID" />
      </div>
    </div>
    <SuggestionList :deckID="deckID" />
  </div>
</template>

<script setup lang="ts">
import { defineProps, computed, watch } from "vue"
import StartStopButton from "./StartStopButton.vue"
import RpmSwitch from "./RpmSwitch.vue"
import PitchFader from "./PitchFader.vue"
import RecordIcon from "./RecordIcon.vue"
import BPMTapper from "./BPMTapper.vue"
import { userStore } from "@/stores/userStore"
import { sessionStore } from "@/stores/sessionStore"
import { trackStore } from "@/stores/trackStore"
import getPositionColour from "@/utils/positionColours"
import { getDurationString } from "@/utils/durationFunctions"
import getPercent from "@/utils/getPercent"
import DanceIcon from "../icons/DanceIcon.vue"
import BoltIcon from "../icons/BoltIcon.vue"
import SmileIcon from "../icons/SmileIcon.vue"
import {
  getKeyStringShort,
  getCamelotString,
  getKeyColour,
  adjustKey,
} from "@/utils/pitchClassFunctions"
import SuggestionList from "./SuggestionList.vue"
const session = sessionStore()
const tracks = trackStore()
const user = userStore()

const props = defineProps<{
  deckID: number
}>()

const track = computed(() => session.decks[props.deckID].loadedTrack)

const timeSignature = computed(() =>
  track.value?.timeSignatureUpper && track.value?.timeSignatureLower
    ? [track.value?.timeSignatureUpper, track.value?.timeSignatureLower]
    : track.value?.audioFeatures
    ? [track.value?.audioFeatures.time_signature, 4]
    : null
)

const keyAndMode = computed(() =>
  typeof track.value?.key === "number" && typeof track.value?.mode === "number"
    ? { key: track.value?.key, mode: track.value?.mode }
    : track.value?.audioFeatures && track.value?.audioFeatures.key !== -1
    ? {
        key: track.value?.audioFeatures.key,
        mode: track.value?.audioFeatures.mode,
      }
    : null
)

const keyString = computed(() =>
  !keyAndMode.value
    ? ""
    : user.authd.settings.keyFormat === "key"
    ? getKeyStringShort(keyAndMode.value.key, keyAndMode.value.mode)
    : getCamelotString(keyAndMode.value.key, keyAndMode.value.mode)
)

const keyColour = computed(() =>
  keyAndMode.value
    ? getKeyColour(keyAndMode.value.key, keyAndMode.value.mode)
    : ""
)

const positionColour = computed(() =>
  session.decks[props.deckID].loadedTrack?.position
    ? getPositionColour(session.decks[props.deckID].loadedTrack!.position!)
    : "hsl(0, 0%, 68%)"
)

// set adjustedLoadedBpm when dependencies change
watch(
  () =>
    session.decks[props.deckID].loadedTrack?.bpmFinal
      ? (session.decks[props.deckID].pitch *
          0.0001 *
          user.authd.settings.turntablePitchRange +
          1) *
        session.decks[props.deckID].loadedTrack!.bpmFinal!
      : null,
  (bpm: number | null) => (session.decks[props.deckID].adjustedBpm = bpm)
)

// set adjustedKey when dependencies change
watch(
  () =>
    session.decks[props.deckID].loadedTrack?.keyAndMode &&
    session.decks[props.deckID].loadedTrack?.keyAndMode
      ? adjustKey(
          session.decks[props.deckID].loadedTrack!.keyAndMode!.key!,
          session.decks[props.deckID].pitch *
            0.0001 *
            user.authd.settings.turntablePitchRange +
            1
        )
      : null,
  (bpm: number | null) => (session.decks[props.deckID].adjustedKey = bpm)
)
</script>

<style scoped lang="scss">
.deck-area-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  .deck-wrapper {
    position: relative;
    .deck {
      border-top: 4px solid rgb(192, 192, 192);
      border-left: 4px solid rgb(163, 163, 163);
      border-right: 4px solid rgb(105, 105, 105);
      border-bottom: 4px solid rgb(65, 65, 65);
      position: relative;
      height: 700px;
      width: 900px;
      box-sizing: content-box;
      background: var(--deck-silver);
    }
  }
}

.rpm-switch-container {
  position: absolute;
  bottom: 20px;
  left: 400px;
  display: flex;
  justify-content: start;
}
.t-detail {
  color: var(--darker-text);
  font-weight: 500;
  height: 26px;
  line-height: 26px;
  position: absolute;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  z-index: 4;
}
.audio-feature {
  background-color: transparent;
  height: 26px;
  line-height: 26px;
  padding: 0 0 0 10px;
  border-radius: 0;
  span {
    width: 40px;
  }
}
.title {
  font-size: 18px;
  width: 48%;
  top: 2%;
  right: 2%;
  .position {
    color: v-bind(positionColour);
  }
}
.artist {
  font-size: 18px;
  width: 39%;
  top: 7%;
  right: 2%;
}
.album-details {
  width: 34%;
  top: 12%;
  right: 2%;
  .year {
    margin-left: 18px;
    color: var(--dark-text);
  }
}
.genre {
  width: 30%;
  top: 17%;
  right: 2%;
}
.duration {
  top: 22%;
  right: 2%;
}
.key {
  top: 27%;
  right: 2%;
  height: 26px;
  line-height: 26px;
  font-weight: 500;
  padding: 0 10px;
  border-radius: 6px;
  background-color: v-bind(keyColour);
  color: var(--key-text);
  text-align: center;
}
.danceability {
  top: 32%;
  right: 2%;
}
.energy {
  top: 37%;
  right: 2%;
}
.valence {
  top: 42%;
  right: 2%;
}
.time-signature {
  top: 47%;
  right: 2%;
  height: 36px;
}
.load-track {
  position: absolute;
  height: 38px;
  line-height: 32px;
  top: 4%;
  left: 4%;
  z-index: 3;
  border-radius: 8px;
  box-sizing: border-box;
  background: transparent;
  color: var(--load-button);
  font-weight: 600;
  border: 3px solid var(--load-button);
  &:hover {
    box-shadow: 0 0 4px 4px rgba(44, 102, 219, 0.4);
    transition: box-shadow 0.2s ease-in-out;
  }
}
</style>
