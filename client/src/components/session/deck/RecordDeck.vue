<template>
  <div class="deck-area-container">
    <div class="deck-wrapper">
      <div
        class="deck"
        :class="{
          silver: user.authd.settings.turntableTheme === 'silver',
          black: user.authd.settings.turntableTheme === 'black',
        }"
      >
        <button class="load-track" @click="session.loadTrackTo = deckID">
          LOAD
        </button>
        <div class="loaded-detail title">
          <span class="position">
            {{ track?.position }}
          </span>
          {{ track?.title }}
        </div>
        <span class="loaded-detail artist">
          {{ track?.artistsFinal }}
        </span>
        <div class="loaded-detail album-details">
          <span class="catno">{{ track?.catno }}</span>
          <span class="year">{{ track?.year }}</span>
        </div>
        <span class="loaded-detail genre">
          {{ track?.genre }}
        </span>
        <span class="loaded-detail duration" v-if="track?.durationFinal">
          "{{ getDurationString(track.durationFinal) }}"
        </span>
        <span class="loaded-detail key" v-if="keyString">
          {{ keyString }}
        </span>
        <button
          class="loaded-detail audio-feature danceability"
          v-if="track?.audioFeatures"
          @click="tracks.toShowFeatures = track?._id || ''"
        >
          <DanceIcon /><span>{{
            getPercent(track.audioFeatures.danceability)
          }}</span>
        </button>
        <button
          class="loaded-detail audio-feature energy"
          v-if="track?.audioFeatures"
          @click="tracks.toShowFeatures = track?._id || ''"
        >
          <BoltIcon /><span>{{ getPercent(track.audioFeatures.energy) }}</span>
        </button>
        <button
          class="loaded-detail audio-feature valence"
          v-if="track?.audioFeatures"
          @click="tracks.toShowFeatures = track?._id || ''"
        >
          <SmileIcon /><span>{{
            getPercent(track.audioFeatures.valence)
          }}</span>
        </button>
        <div class="loaded-detail time-signature" v-if="timeSignature">
          <sup>{{ timeSignature[0] }}</sup>
          <sub>{{ timeSignature[1] }}</sub>
        </div>
        <StroboscopicLegend />
        <StartStopButton :deckID="deckID" />
        <RpmSwitch :deckID="deckID" :speed="33" />
        <RpmSwitch :deckID="deckID" :speed="45" />
        <PitchFader :deckID="deckID" />
        <RecordPlatter :deckID="deckID" />
        <BPMTapper :deckID="deckID" />
      </div>
    </div>
    <SuggestionList :deckID="deckID" />
  </div>
</template>

<script setup lang="ts">
import { defineProps, computed } from "vue"
import { getDurationString } from "@/utils/durationFunctions"
import { sessionStore } from "@/stores/sessionStore"
import { trackStore } from "@/stores/trackStore"
import { userStore } from "@/stores/userStore"
import BoltIcon from "../../icons/BoltIcon.vue"
import BPMTapper from "./BPMTapper.vue"
import DanceIcon from "../../icons/DanceIcon.vue"
import getPercent from "@/utils/getPercent"
import getPositionColour from "@/utils/positionColours"
import PitchFader from "./PitchFader.vue"
import RecordPlatter from "./RecordPlatter.vue"
import RpmSwitch from "./RpmSwitch.vue"
import SmileIcon from "../../icons/SmileIcon.vue"
import StartStopButton from "./StartStopButton.vue"
import SuggestionList from "../SuggestionList.vue"
import {
  getKeyStringShort,
  getCamelotString,
  getKeyColour,
} from "@/utils/keyFunctions"
import StroboscopicLegend from "./StroboscopicLegend.vue"
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
</script>

<style scoped lang="scss">
.deck-area-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  .deck-wrapper {
    position: relative;
    .deck {
      background: var(--deck-bg);
      border-top-color: var(--deck-border-top);
      border-right-color: var(--deck-border-right);
      border-bottom-color: var(--deck-border-bottom);
      border-left-color: var(--deck-border-left);
      border-width: 4px;
      border-style: solid;
      position: relative;
      height: 700px;
      width: 900px;
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
.loaded-detail {
  color: var(--loaded-text);
  font-weight: 600;
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
    font-weight: 800;
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
    color: var(--loaded-year-text);
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
  transition: box-shadow 200ms;
  &:hover {
    box-shadow: 0 0 4px 4px var(--load-button-shadow);
  }
}

@media (max-width: 1878px) {
  .deck-area-container {
    width: 100%;
  }
  .deck-wrapper {
    margin: 0 auto;
  }
}
</style>
