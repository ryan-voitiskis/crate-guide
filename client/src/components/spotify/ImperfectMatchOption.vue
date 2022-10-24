<template>
  <div class="imperfect-match-option" :class="{ selected: selected }">
    <div class="cover" :style="backgroundImg"></div>
    <h3 class="title">{{ title }}</h3>
    <div class="year">{{ year }}</div>
    <span class="artists">{{ artist }}</span>
    <div class="controls">
      <a
        class="play-on-spotify icon-button btn"
        :href="external_urls"
        target="_blank"
      >
        <SpotifyLogo />PLAY ON SPOTIFY
      </a>
      <button @click="spotify.toggleImperfectMatchesOption(record, id)">
        {{ selected ? "Deselect" : " Select" }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineProps, computed } from "vue"
import SpotifyLogo from "../icons/SpotifyLogo.vue"
import { spotifyStore } from "@/stores/spotifyStore"

const spotify = spotifyStore()

const props = defineProps<{
  record: string
  id: string
  levenshtein: number
  image: string
  title: string
  artist: string
  external_urls: string
  release_date: string
  selected?: boolean
}>()

const year = new Date(props.release_date).getFullYear()

const backgroundImg = computed(() => {
  return `background-image: url("${props.image}");`
})
</script>

<style scoped lang="scss">
.imperfect-match-option {
  display: grid;
  grid-template-columns: 12rem 4fr;
  grid-template-rows: 4rem 2rem 3rem 3rem;
  width: 100%;
  column-gap: 1rem;
  .cover {
    background-color: hsl(40, 13%, 82%);
    grid-area: 1 / 1 / 5 / 2;
    overflow: hidden;
    z-index: 0;
    background-repeat: no-repeat;
    background-size: contain;
  }
  h3.title {
    color: var(--darker-text);
    grid-area: 1 / 2 / 2 / 3;
    margin: 0;
    line-height: 4rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .year {
    grid-area: 2 / 2 / 3 / 3;
    color: var(--light-text);
    line-height: 2rem;
    font-size: 1.2rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .artists {
    grid-area: 3 / 2 / 4 / 3;
    line-height: 3rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .controls {
    grid-area: 4 / 2 / 5 / 3;
    display: flex;
    gap: 1rem;
    .play-on-spotify {
      padding: 0 1.6rem;
      background-color: antiquewhite;
      font-size: 1.2rem;
      font-weight: 600;
      letter-spacing: 0.1rem;
      border-radius: 1.5rem;

      svg {
        height: 2.1rem;
        width: 2.1rem;
      }
    }
    button,
    .play-on-spotify {
      margin: 0;
      height: 3rem;
      line-height: 3rem;
    }
  }
  &.selected {
    background-color: antiquewhite;
  }
}
</style>
