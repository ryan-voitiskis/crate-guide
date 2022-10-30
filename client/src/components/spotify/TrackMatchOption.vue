<template>
  <div class="track-match-option" :class="{ selected: selected }">
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

defineProps<{
  record: string
  track: string
  id: string
  name: string
  artists: string
  duration: number
  external_url: string
  levenshtein: number
  selected?: boolean
}>()
</script>

<style scoped lang="scss">
.track-match-option {
  padding-left: 1rem;
  overflow: hidden;
  display: grid;
  grid-template-columns: 1fr 12rem;
  grid-template-rows: 4rem 4rem 4rem;
  width: 100%;
  column-gap: 1rem;
  border: transparent 2px solid;
  .play-on-spotify {
    grid-area: 1 / 1 / 2 / 2;
  }
  .name {
    line-height: 4rem;
    color: var(--darker-text);
    font-weight: 500;
    grid-area: 2 / 1 / 3 / 2;
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
    grid-area: 3 / 1 / 4 / 2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .select-toggle {
    grid-area: 1 / 2 / 4 / 3;
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
  }
  &.selected {
    border: #1db954 2px solid;
    border-radius: 1rem;
    .select-toggle {
      border-radius: 0;
    }
  }
}
</style>
