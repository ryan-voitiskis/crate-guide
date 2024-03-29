<template>
  <div class="track-match-option" :class="{ selected: selected }">
    <div class="cover"></div>
    <PlayOnSpotifyButton :href="external_url" />
    <span class="name">
      {{ name }}
    </span>
    <span class="artists">{{ artists }}</span>
    <button
      class="select-toggle"
      @click="spotify.toggleInexactTrackOption(track, id)"
    >
      {{ selected ? "Deselect" : " Select" }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { defineProps } from "vue"
import { spotifyStore } from "@/stores/spotifyStore"
import PlayOnSpotifyButton from "./PlayOnSpotifyButton.vue"

const spotify = spotifyStore()

const props = defineProps<{
  record: string
  track: string
  id: string
  name: string
  artists: string
  external_url: string
  release_date: string
  levenshtein: number
  image: string
  selected?: boolean
}>()

const coverImg = `url("${props.image}")`
</script>

<style scoped lang="scss">
.track-match-option {
  overflow: hidden;
  display: grid;
  grid-template-columns: 120px 1fr 120px;
  grid-template-rows: 40px 40px 40px;
  width: 100%;
  column-gap: 10px;
  border: transparent 2px solid;
  .cover {
    background-color: hsl(40, 13%, 82%);
    background-image: v-bind(coverImg);
    grid-area: 1 / 1 / 4 / 2;
    overflow: hidden;
    z-index: 0;
    background-repeat: no-repeat;
    background-size: contain;
    z-index: -1;
  }
  .name {
    line-height: 40px;
    color: var(--darker-text);
    font-weight: 500;
    grid-area: 2 / 2 / 3 / 3;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    .year {
      color: var(--light-text);
      line-height: 20px;
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
  .artists {
    grid-area: 3 / 2 / 4 / 3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .select-toggle {
    grid-area: 1 / 3 / 4 / 4;
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
  }
  &.selected {
    border: var(--spotify-green) 2px solid;
    border-radius: 10px;
    .select-toggle {
      border-radius: 0;
    }
  }
}
</style>
