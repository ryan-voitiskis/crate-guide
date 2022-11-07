<template>
  <div class="track-option">
    <div class="cover"></div>
    <span class="bpm">{{ bpm }}</span>
    <span class="name">
      {{ props.track.title }}
    </span>
    <span class="artists">{{ track.artists }}</span>
    <button class="load" @click="load()">Load</button>
  </div>
</template>

<script setup lang="ts">
import { defineProps } from "vue"
import { trackStore } from "@/stores/trackStore"
import { TrackOfRecord } from "@/interfaces/Track"
import { track } from "@vue/reactivity"
const tracks = trackStore()

const props = defineProps<{
  track: TrackOfRecord
}>()

const coverImg = `url("${props.track.cover}")`

const bpm = props.track.bpm
  ? props.track.bpm.toFixed()
  : props.track.audioFeatures?.tempo
  ? props.track.audioFeatures?.tempo.toFixed()
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
  grid-template-columns: 4rem 5rem 1fr 8rem;
  width: 100%;
  column-gap: 1rem;
  border: transparent 2px solid;
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
  }
  .name {
    line-height: 4rem;
    color: var(--darker-text);
    font-weight: 500;
    grid-area: 1 / 3 / 2 / 4;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    .year {
      color: var(--light-text);
      line-height: 2rem;
      font-size: 1.2rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
  .artists {
    grid-area: 1 / 2 / 2 / 3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
