<template>
  <div class="track">
    <div class="details">
      <div class="spotify-link-wrapper">
        <a
          class="spotify-link"
          v-if="spotifyID"
          :href="spotifyLink"
          target="_blank"
          ><SpotifyLogo
        /></a>
      </div>
      <span class="position" v-if="position">{{ position }}</span>
      <span class="bpm" v-if="bpm">{{ bpm }}</span>
      <span class="title">{{ title }}</span>
      <span class="duration" v-if="duration">"{{ duration }}"</span>
      <span class="genre" v-if="genre">{{ genre }}</span>
    </div>
    <div class="controls">
      <button class="inline-btn edit" @click="tracks.toEdit = _id">
        <PencilIcon />
      </button>
      <button class="inline-btn delete" @click="tracks.toDelete = _id">
        <TrashIcon />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineProps, computed } from "vue"
import { trackStore } from "@/stores/trackStore"
import PencilIcon from "@/components/icons/PencilIcon.vue"
import TrashIcon from "@/components/icons/TrashIcon.vue"
import getBPMColour from "@/utils/getBPMColour"
import SpotifyLogo from "@/components/icons/SpotifyLogo.vue"
const tracks = trackStore()

const props = defineProps<{
  _id: string
  spotifyID?: string
  position?: string
  bpm?: number
  title: string
  duration?: string
  genre?: string
  audioFeatures?: {
    acousticness: number
    danceability: number
    duration_ms: number
    energy: number
    instrumentalness: number
    key: number
    liveness: number
    loudness: number
    mode: number
    speechiness: number
    tempo: number
    time_signature: number
    valence: number
  }
}>()

const spotifyLink = props.spotifyID
  ? `https://open.spotify.com/track/${props.spotifyID}`
  : ``

const positionColours = [
  ["A", "hsl(342, 60%, 60%)"],
  ["B", "hsl(210, 60%, 55%)"],
  ["C", "hsl(157, 40%, 55%)"],
  ["D", "hsl(30, 71%, 65%)"],
  ["E", "hsl(89, 60%, 50%)"],
  ["F", "hsl(259, 60%, 66%)"],
  ["G", "hsl(55, 44%, 50%)"],
  ["H", "hsl(108, 44%, 50%)"],
  ["I", "hsl(342, 60%, 60%)"],
  ["J", "hsl(210, 60%, 55%)"],
  ["K", "hsl(157, 40%, 55%)"],
  ["L", "hsl(30, 71%, 65%)"],
  ["M", "hsl(89, 60%, 50%)"],
  ["N", "hsl(259, 60%, 66%)"],
  ["O", "hsl(55, 44%, 50%)"],
  ["P", "hsl(108, 44%, 50%)"],
  ["Q", "hsl(342, 60%, 60%)"],
  ["R", "hsl(210, 60%, 55%)"],
  ["S", "hsl(157, 40%, 55%)"],
  ["T", "hsl(30, 71%, 65%)"],
  ["U", "hsl(89, 60%, 50%)"],
  ["V", "hsl(259, 60%, 66%)"],
  ["W", "hsl(55, 44%, 50%)"],
  ["X", "hsl(108, 44%, 50%)"],
  ["Y", "hsl(342, 60%, 60%)"],
  ["Z", "hsl(210, 60%, 55%)"],
]

// returns text colour for position
// * computed because is reactive (eg. track edit changes position)
const positionColour = computed(() => {
  if (props.position) {
    for (let i = 0; i < positionColours.length; i++) {
      if (
        props.position.charAt(0).localeCompare(positionColours[i][0], "en", {
          sensitivity: "base",
        }) === 0
      )
        return positionColours[i][1]
    }
  }
  return "hsl(0, 0%, 68%)"
})

// * computed because is reactive (eg. track edit changes bpm)
const bpmColour = computed(() => (props.bpm ? getBPMColour(props.bpm) : null))
</script>

<style scoped lang="scss">
.track {
  height: 3rem;
  display: flex;
  .details {
    display: flex;
    position: relative;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    span {
      line-height: 3rem;
    }
    .spotify-link-wrapper {
      width: 3rem;
      display: flex;
      height: 100%;
      width: 3rem;
      .spotify-link {
        height: 100%;
        width: 3rem;
        display: flex;
        background-color: transparent;
        justify-content: center;
        svg {
          transition: color 0.5s;
          align-self: center;
          color: var(--spotify-light-green);
          height: 2.2rem;
        }
        &:hover {
          svg {
            color: var(--spotify-black);
          }
        }
      }
    }
    .position {
      color: v-bind(positionColour);
      font-weight: 500;
      line-height: 3rem;
      margin: 0 0 0 1rem;
    }
    .bpm {
      color: v-bind(bpmColour);
      font-weight: 500;
      margin-left: 1rem;
    }
    .title {
      margin-left: 1rem;
    }
    .duration {
      color: var(--light-text);
      margin-left: 1rem;
    }
    .genre {
      color: var(--light-text);
      font-style: italic;
      margin-left: 1rem;
    }
  }
  .controls {
    margin-left: auto;
    flex-shrink: 0;
  }
}
</style>
