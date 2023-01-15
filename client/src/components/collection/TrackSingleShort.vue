<template>
  <div class="track">
    <div class="details">
      <div class="spotify-link-wrapper" v-if="track.spotifyID">
        <a
          class="spotify-link"
          v-if="track.spotifyID"
          :href="spotifyLink"
          target="_blank"
          ><SpotifyLogo
        /></a>
      </div>
      <span class="position" v-if="track.position">{{ track.position }}</span>
      <div class="time-signature" v-if="timeSignature">
        <sup>{{ timeSignature[0] }}</sup>
        <sub>{{ timeSignature[1] }}</sub>
      </div>
      <span class="bpm" v-if="bpm">{{ bpm }}</span>
      <button
        class="audio-feature danceability"
        v-if="track.audioFeatures"
        @click="tracks.toShowFeatures = track._id"
      >
        <DanceIcon />{{ getPercent(track.audioFeatures.danceability) }}
      </button>
      <button
        class="audio-feature energy"
        v-if="track.audioFeatures"
        @click="tracks.toShowFeatures = track._id"
      >
        <BoltIcon />{{ getPercent(track.audioFeatures.energy) }}
      </button>
      <button
        class="audio-feature valence"
        v-if="track.audioFeatures"
        @click="tracks.toShowFeatures = track._id"
      >
        <SmileIcon />{{ getPercent(track.audioFeatures.valence) }}
      </button>
      <span class="duration" v-if="duration">{{ duration }}</span>
      <span
        class="key"
        v-if="keyString"
        :class="{ long: user.authd.settings.keyFormat === 'key' }"
      >
        {{ keyString }}
      </span>
      <span class="title">{{ track.title }}</span>
      <span class="artists" v-if="track.artists">{{ track.artists }}</span>
      <span class="genre" v-if="track.genre">{{ track.genre }}</span>
    </div>
    <div class="controls">
      <button class="inline-btn edit" @click="tracks.toEdit = track._id">
        <PencilIcon />
      </button>
      <button class="inline-btn delete" @click="tracks.toDelete = track._id">
        <TrashIcon />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineProps, computed } from "vue"
import { getDurationString } from "@/utils/durationFunctions"
import { Track } from "@/interfaces/Track"
import { trackStore } from "@/stores/trackStore"
import { userStore } from "@/stores/userStore"
import BoltIcon from "../icons/BoltIcon.vue"
import DanceIcon from "../icons/DanceIcon.vue"
import getBPMColour from "@/utils/getBPMColour"
import getPercent from "@/utils/getPercent"
import getPositionColour from "@/utils/positionColours"
import PencilIcon from "@/components/icons/PencilIcon.vue"
import SmileIcon from "../icons/SmileIcon.vue"
import SpotifyLogo from "@/components/icons/SpotifyLogo.vue"
import TrashIcon from "@/components/icons/TrashIcon.vue"
import {
  getCamelotString,
  getKeyColour,
  getKeyStringShort,
} from "@/utils/keyFunctions"

const tracks = trackStore()
const user = userStore()

const props = defineProps<{
  track: Track
}>()

const spotifyLink = computed(() =>
  props.track.spotifyID
    ? `https://open.spotify.com/track/${props.track.spotifyID}`
    : ``
)

const timeSignature = computed(() =>
  props.track.timeSignatureUpper && props.track.timeSignatureLower
    ? [props.track.timeSignatureUpper, props.track.timeSignatureLower]
    : props.track.audioFeatures
    ? [props.track.audioFeatures.time_signature, 4]
    : null
)

const positionColour = computed(() =>
  props.track.position
    ? getPositionColour(props.track.position)
    : "hsl(0, 0%, 68%)"
)

const bpm = computed(() =>
  props.track.bpm
    ? props.track.bpm
    : props.track.audioFeatures
    ? Math.round(props.track.audioFeatures.tempo)
    : null
)

const keyAndMode = computed(() =>
  typeof props.track.key === "number" && typeof props.track.mode === "number"
    ? { key: props.track.key, mode: props.track.mode }
    : props.track.audioFeatures && props.track.audioFeatures.key !== -1
    ? {
        key: props.track.audioFeatures.key,
        mode: props.track.audioFeatures.mode,
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

const bpmColour = computed(() =>
  bpm.value ? getBPMColour(bpm.value, user.authd.settings.theme) : null
)

const duration = computed(() =>
  props.track.duration
    ? getDurationString(props.track.duration)
    : props.track.audioFeatures?.duration_ms
    ? getDurationString(props.track.audioFeatures?.duration_ms)
    : null
)
</script>

<style scoped lang="scss">
.track {
  height: 30px;
  display: flex;
  .details {
    display: flex;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    span {
      flex-shrink: 0;
      line-height: 30px;
    }
    .spotify-link-wrapper {
      width: 30px;
      display: flex;
      height: 100%;
      width: 30px;
      .spotify-link {
        height: 100%;
        width: 30px;
        display: flex;
        background-color: transparent;
        justify-content: center;
        svg {
          transition: color 200ms;
          align-self: center;
          color: var(--spotify-light-green);
          height: 22px;
        }
        &:hover {
          svg {
            color: var(--spotify-icon-hover);
          }
        }
      }
    }
    .position {
      width: 20px;
      color: v-bind(positionColour);
      font-weight: 500;
      line-height: 30px;
      margin-left: 10px;
    }
    .time-signature {
      text-align: center;
      width: 15px;
      margin-left: 10px;
    }
    .bpm {
      width: 32px;
      text-align: center;
      color: v-bind(bpmColour);
      font-weight: 500;
      margin-left: 10px;
    }
    .audio-feature {
      line-height: 30px;
      align-content: center;
      display: flex;
      border-radius: 0;
      height: 100%;
      width: 56px;
      background-color: transparent;
      padding: 0;
      font-size: 12px;
      svg {
        width: 18px;
        margin-right: 3px;
      }
      &:first-of-type {
        margin-left: 6px;
      }
    }
    span.duration {
      display: inline-block;
      width: 40px;
      font-style: italic;
      text-align: center;
    }
    .key {
      display: inline-block;
      width: 60px;
      height: 26px;
      line-height: 26px;
      font-weight: 500;
      padding: 0 10px;
      margin: 2px;
      border-radius: 6px;
      background-color: v-bind(keyColour);
      color: var(--key-text);
      text-align: center;
      &.long {
        font-size: 12px;
      }
    }
    .title {
      padding: 0 5px;
    }
    .artists {
      padding: 0 5px;
      font-weight: 500;
      color: var(--artists-color);
    }
    .genre {
      color: var(--light-text);
      font-style: italic;
      padding: 0 5px;
    }
  }
  .controls {
    margin-left: auto;
    flex-shrink: 0;
  }
  &:nth-child(odd) {
    background-color: var(--track-short-odd);
  }
}
</style>
