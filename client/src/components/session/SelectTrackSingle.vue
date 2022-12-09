<template>
  <div class="track-option" @click="load">
    <div class="cover"></div>
    <span class="position" v-if="track.position">{{ track.position }}</span>
    <div class="time-signature" v-if="track.timeSignature">
      <sup>{{ track.timeSignature[0] }}</sup>
      <sub>{{ track.timeSignature[1] }}</sub>
    </div>
    <span class="bpm" v-if="track.bpmFinal">
      {{ Math.round(track.bpmFinal).toString() }}
    </span>
    <button
      class="audio-feature danceability"
      v-if="track.audioFeatures"
      @click.stop="tracks.toShowFeatures = track._id"
    >
      <DanceIcon />{{ getPercent(track.audioFeatures.danceability) }}
    </button>
    <button
      class="audio-feature energy"
      v-if="track.audioFeatures"
      @click.stop="tracks.toShowFeatures = track._id"
    >
      <BoltIcon />{{ getPercent(track.audioFeatures.energy) }}
    </button>
    <button
      class="audio-feature valence"
      v-if="track.audioFeatures"
      @click.stop="tracks.toShowFeatures = track._id"
    >
      <SmileIcon />{{ getPercent(track.audioFeatures.valence) }}
    </button>
    <span class="duration" v-if="track.durationFinal">
      {{ getDurationString(track.durationFinal) }}</span
    >
    <span
      class="key"
      v-if="track.keyFinal"
      :class="{ long: user.authd.settings.keyFormat === 'key' }"
    >
      {{
        user.authd.settings.keyFormat === "key"
          ? track.keyFinal.keyString
          : track.keyFinal.camelotString
      }}
    </span>
    <span class="title">{{ track.title }}</span>
    <span class="artists">{{ track.artistsFinal }}</span>
    <span class="genre" v-if="track.genre">{{ track.genre }}</span>
    <span class="label">{{ track.label }}</span>
    <span class="catno">{{ track.catno }}</span>
    <span class="year">{{ track.year }}</span>
    <button class="play" @click="load">
      <PlayIcon />
    </button>
  </div>
</template>

<script setup lang="ts">
import { defineProps } from "vue"
import { getDurationString } from "@/utils/durationFunctions"
import { sessionStore } from "@/stores/sessionStore"
import { TrackPlus } from "@/interfaces/Track"
import { trackStore } from "@/stores/trackStore"
import { userStore } from "@/stores/userStore"
import BoltIcon from "../icons/BoltIcon.vue"
import DanceIcon from "../icons/DanceIcon.vue"
import getBPMColour from "@/utils/getBPMColour"
import getPercent from "@/utils/getPercent"
import getPositionColour from "@/utils/positionColours"
import PlayIcon from "../icons/PlayIcon.vue"
import SmileIcon from "../icons/SmileIcon.vue"

const session = sessionStore()
const tracks = trackStore()
const user = userStore()

const props = defineProps<{
  track: TrackPlus
}>()

const coverImg = `url("${props.track.cover}")`

const keyColour = props.track.keyFinal ? props.track.keyFinal.colour : null

const bpmColour = props.track.bpmFinal
  ? getBPMColour(props.track.bpmFinal)
  : null

const positionColour = props.track.position
  ? getPositionColour(props.track.position)
  : "hsl(0, 0%, 68%)"

function load() {
  session.loadTrack(props.track._id, session.loadTrackTo)
  session.loadTrackTo = -1
}
</script>

<style scoped lang="scss">
.track-option {
  overflow: hidden;
  display: grid;
  grid-template-columns: 40px 26px 22px 32px 44px 44px 44px 40px 60px 2fr 1fr 1fr 1fr 1fr 38px 40px;
  width: 100%;
  column-gap: 10px;
  transition: background-color 50ms linear;
  cursor: pointer;
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
    background-repeat: no-repeat;
    background-size: contain;
  }
  .position {
    grid-area: 1 / 2 / 2 / 3;
    text-align: center;
    color: v-bind(positionColour);
  }
  .time-signature {
    text-align: center;
    grid-area: 1 / 3 / 2 / 4;
    font-size: 20px;
    padding-top: 1px;
    height: 40px;
  }
  .bpm {
    grid-area: 1 / 4 / 2 / 5;
    text-align: center;
    color: v-bind(bpmColour);
  }
  .audio-feature {
    border-radius: 0;
    height: 100%;
    width: 54px;
    margin: 0 -5px;
    background-color: transparent;
    padding: 0;
    font-size: 12px;
    svg {
      width: 18px;
      margin-right: 1px;
    }
    &:hover {
      background-color: var(--track-features-hover);
    }
  }
  .danceability {
    grid-area: 1 / 5 / 2 / 6;
  }
  .energy {
    grid-area: 1 / 6 / 2 / 7;
  }
  .valence {
    grid-area: 1 / 7 / 2 / 8;
  }
  .duration {
    grid-area: 1 / 8 / 2 / 9;
    font-style: italic;
    text-align: center;
  }
  .key {
    grid-area: 1 / 9 / 2 / 10;
    height: 26px;
    width: 100%;
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
    grid-area: 1 / 10 / 2 / 11;
  }
  .artists {
    grid-area: 1 / 11 / 2 / 12;
  }
  .genre {
    grid-area: 1 / 12 / 2 / 13;
  }
  .label {
    grid-area: 1 / 13 / 2 / 14;
  }
  .catno {
    grid-area: 1 / 14 / 2 / 15;
  }
  .year {
    grid-area: 1 / 15 / 2 / 16;
  }
  .play {
    grid-area: 1 / 16 / 2 / 17;
    width: 100%;
    height: 100%;
    border-radius: 0;
    background-color: transparent;
    color: var(--play-button);
    svg {
      fill: transparent;
      transition: fill 80ms linear;
    }
  }
  &:hover {
    background-color: var(--track-hover);
    .play {
      svg {
        color: var(--play-button);
        fill: var(--play-button);
      }
    }
  }
  &:nth-child(even) {
    background-color: var(--even-row-bg);
    &:hover {
      background-color: var(--track-hover);
    }
  }
}
</style>
