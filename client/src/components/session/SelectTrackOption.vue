<template>
  <div class="track-option">
    <div class="cover"></div>
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
    <button class="load" @click="load()">Load</button>
  </div>
</template>

<script setup lang="ts">
import { defineProps } from "vue"
import { trackStore } from "@/stores/trackStore"
import { userStore } from "@/stores/userStore"
import { TrackOfRecord } from "@/interfaces/Track"
import getBPMColour from "@/utils/getBPMColour"
import {
  getKeyStringShort,
  getCamelotString,
  getKeyColour,
} from "@/utils/pitchClassMap"
const tracks = trackStore()
const user = userStore()

const props = defineProps<{
  track: TrackOfRecord
}>()

const coverImg = `url("${props.track.cover}")`

const keyString = props.track.audioFeatures
  ? props.track.audioFeatures.key !== -1
    ? user.authd.settings.keyFormat === "key"
      ? getKeyStringShort(
          props.track.audioFeatures.key,
          props.track.audioFeatures.mode
        )
      : getCamelotString(
          props.track.audioFeatures.key,
          props.track.audioFeatures.mode
        )
    : ""
  : ""

const keyColour =
  props.track.key && props.track.mode
    ? getKeyColour(props.track.key, props.track.mode)
    : props.track.audioFeatures && props.track.audioFeatures.key !== -1
    ? getKeyColour(
        props.track.audioFeatures.key,
        props.track.audioFeatures.mode
      )
    : ""

const bpmColour = props.track.bpm
  ? getBPMColour(props.track.bpm)
  : props.track.audioFeatures?.tempo
  ? getBPMColour(props.track.audioFeatures.tempo)
  : ""

const load = () =>
  tracks.loadTrackTo === 1
    ? (tracks.deck1Track = props.track._id)
    : (tracks.deck2Track = props.track._id)
</script>

<style scoped lang="scss">
.track-option {
  overflow: hidden;
  display: grid;
  grid-template-columns: 4rem 4rem 6rem 6fr 4fr 3fr 10rem 6rem 6rem;
  width: 100%;
  column-gap: 1rem;
  span {
    color: var(--darker-text);
    line-height: 4rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
    margin: 0;
  }
  .cover {
    height: 4rem;
    background-color: hsl(40, 13%, 82%);
    background-image: v-bind(coverImg);
    grid-area: 1 / 1 / 2 / 2;
    overflow: hidden;
    z-index: 0;
    background-repeat: no-repeat;
    background-size: contain;
    z-index: -1;
  }
  .bpm {
    grid-area: 1 / 2 / 2 / 3;
    text-align: center;
    color: v-bind(bpmColour);
  }
  .key {
    grid-area: 1 / 3 / 2 / 4;
    height: 2.6rem;
    max-width: 100%;
    line-height: 2.6rem;
    justify-self: center;
    align-self: center;
    font-weight: 500;
    padding: 0 1rem;
    border-radius: 0.6rem;
    background-color: v-bind(keyColour);
    color: var(--key-text);
    text-align: center;
    &.long {
      font-size: 1.2rem;
    }
  }
  .title {
    grid-area: 1 / 4 / 2 / 5;
  }
  .artists {
    grid-area: 1 / 5 / 2 / 6;
  }
  .label {
    grid-area: 1 / 6 / 2 / 7;
  }
  .catno {
    grid-area: 1 / 7 / 2 / 8;
  }
  .year {
    grid-area: 1 / 8 / 2 / 9;
    text-align: center;
  }
  .load {
    grid-area: 1 / 9 / 2 / 10;
  }
}
</style>
