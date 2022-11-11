<template>
  <div class="track">
    <div class="details">
      <div class="spotify-link-wrapper">
        <a
          class="spotify-link"
          v-if="track.spotifyID"
          :href="spotifyLink"
          target="_blank"
          ><SpotifyLogo
        /></a>
      </div>
      <span class="position" v-if="track.position">{{ track.position }}</span>
      <span class="bpm" v-if="bpm">{{ bpm }}</span>
      <span class="title">{{ track.title }}</span>
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
import { Track } from "@/interfaces/Track"
import { trackStore } from "@/stores/trackStore"
import PencilIcon from "@/components/icons/PencilIcon.vue"
import TrashIcon from "@/components/icons/TrashIcon.vue"
import getBPMColour from "@/utils/getBPMColour"
import SpotifyLogo from "@/components/icons/SpotifyLogo.vue"
import getPositionColour from "@/utils/positionColours"
const tracks = trackStore()

const props = defineProps<{
  track: Track
}>()

const spotifyLink = props.track.spotifyID
  ? `https://open.spotify.com/track/${props.track.spotifyID}`
  : ``

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

const bpmColour = computed(() => (bpm.value ? getBPMColour(bpm.value) : null))
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