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
    <button class="edit" @click="tracks.toEdit = track._id">
      <PencilIcon />
    </button>
  </div>
</template>

<script setup lang="ts">
import { defineProps } from "vue"
import { TrackOfRecord } from "@/interfaces/Track"
import { trackStore } from "@/stores/trackStore"
import { userStore } from "@/stores/userStore"
import getBPMColour from "@/utils/getBPMColour"
import getPositionColour from "@/utils/positionColours"
import PencilIcon from "../icons/PencilIcon.vue"
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

const keyString = !props.track.audioFeatures
  ? ""
  : props.track.audioFeatures.key === -1
  ? ""
  : user.authd.settings.keyFormat === "key"
  ? getKeyStringShort(
      props.track.audioFeatures.key,
      props.track.audioFeatures.mode
    )
  : getCamelotString(
      props.track.audioFeatures.key,
      props.track.audioFeatures.mode
    )

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

const positionColour = props.track.position
  ? getPositionColour(props.track.position)
  : "hsl(0, 0%, 68%)"
</script>

<style scoped lang="scss">
.track-option {
  overflow: hidden;
  display: grid;
  grid-template-columns: 4rem 4rem 4rem 6rem 6fr 4fr 3fr 14rem 4rem 6rem;
  width: 100%;
  column-gap: 1rem;
  span {
    color: var(--dark-text);
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
  .edit {
    grid-area: 1 / 10 / 2 / 11;
    width: 100%;
    height: 100%;
    border-radius: 0;
    background-color: transparent;
  }
}
</style>
