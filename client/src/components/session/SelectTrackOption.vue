<template>
  <div class="track-option">
    <div class="cover"></div>
    <span class="position" v-if="track.position">{{ track.position }}</span>
    <span class="bpm" v-if="track.bpmFinal">
      {{ Math.round(track.bpmFinal).toString() }}
    </span>
    <span
      class="key"
      v-if="keyString"
      :class="{ long: user.authd.settings.keyFormat === 'key' }"
    >
      {{ keyString }}
    </span>
    <span class="title">{{ props.track.title }}</span>
    <span class="artists">{{ track.artistsFinal }}</span>
    <span class="label">{{ track.label }}</span>
    <span class="catno">{{ track.catno }}</span>
    <span class="year">{{ track.year }}</span>
    <button class="play" @click="session.loadTrack(track._id)">
      <PlayIcon />
    </button>
  </div>
</template>

<script setup lang="ts">
import { defineProps } from "vue"
import { sessionStore } from "@/stores/sessionStore"
import { userStore } from "@/stores/userStore"
import { TrackPlus } from "@/interfaces/Track"
import getBPMColour from "@/utils/getBPMColour"
import getPositionColour from "@/utils/positionColours"
import {
  getKeyStringShort,
  getCamelotString,
  getKeyColour,
} from "@/utils/pitchClassMap"
import PlayIcon from "../icons/PlayIcon.vue"
const session = sessionStore()
const user = userStore()

const props = defineProps<{
  track: TrackPlus
}>()

const coverImg = `url("${props.track.cover}")`

const keyAndMode =
  typeof props.track.key === "number" && typeof props.track.mode === "number"
    ? { key: props.track.key, mode: props.track.mode }
    : props.track.audioFeatures && props.track.audioFeatures.key !== -1
    ? {
        key: props.track.audioFeatures.key,
        mode: props.track.audioFeatures.mode,
      }
    : null

const keyString = !keyAndMode
  ? ""
  : user.authd.settings.keyFormat === "key"
  ? getKeyStringShort(keyAndMode.key, keyAndMode.mode)
  : getCamelotString(keyAndMode.key, keyAndMode.mode)

const keyColour = keyAndMode
  ? getKeyColour(keyAndMode.key, keyAndMode.mode)
  : ""

const bpmColour = props.track.bpm
  ? getBPMColour(props.track.bpm)
  : props.track.audioFeatures?.tempo
  ? getBPMColour(props.track.audioFeatures.tempo)
  : ""

const positionColour = props.track.position
  ? getPositionColour(props.track.position)
  : "hsl(0, 0%, 68%)"
</script>

<style scoped lang="scss">
.track-option {
  overflow: hidden;
  display: grid;
  grid-template-columns: 40px 40px 40px 60px 6fr 4fr 3fr 140px 40px 60px;
  width: 100%;
  column-gap: 10px;
  span {
    color: var(--dark-text);
    line-height: 40px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
    margin: 0;
  }
  .cover {
    height: 40px;
    background-color: hsl(40, 13%, 82%);
    background-image: v-bind(coverImg);
    grid-area: 1 / 1 / 2 / 2;
    overflow: hidden;
    z-index: 0;
    background-repeat: no-repeat;
    background-size: contain;
    z-index: -1;
  }
  .position {
    grid-area: 1 / 2 / 2 / 3;
    text-align: center;
    color: v-bind(positionColour);
  }
  .bpm {
    grid-area: 1 / 3 / 2 / 4;
    text-align: center;
    color: v-bind(bpmColour);
  }
  .key {
    grid-area: 1 / 4 / 2 / 5;
    height: 26px;
    max-width: 100%;
    line-height: 26px;
    justify-self: center;
    align-self: center;
    font-weight: 500;
    padding: 0 10px;
    border-radius: 6px;
    background-color: v-bind(keyColour);
    color: var(--key-text);
    text-align: center;
    &.long {
      font-size: 12px;
    }
  }
  .title {
    grid-area: 1 / 5 / 2 / 6;
  }
  .artists {
    grid-area: 1 / 6 / 2 / 7;
  }
  .label {
    grid-area: 1 / 7 / 2 / 8;
  }
  .catno {
    grid-area: 1 / 8 / 2 / 9;
  }
  .year {
    grid-area: 1 / 9 / 2 / 10;
  }
  .play {
    grid-area: 1 / 10 / 2 / 11;
    width: 100%;
    height: 100%;
    border-radius: 0;
    background-color: transparent;
  }
}
</style>
