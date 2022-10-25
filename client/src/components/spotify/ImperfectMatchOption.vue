<template>
  <div class="imperfect-match-option" :class="{ selected: selected }">
    <div class="cover" :style="backgroundImg"></div>
    <a
      class="play-on-spotify icon-button btn"
      :href="external_urls"
      target="_blank"
    >
      <SpotifyLogo />PLAY ON SPOTIFY
    </a>
    <span class="title">
      {{ title }} <span class="year">{{ year }}</span>
    </span>
    <span class="artists">{{ artist }}</span>
    <button
      class="select-toggle"
      @click="spotify.toggleImperfectMatchesOption(record, id)"
    >
      {{ selected ? "Deselect" : " Select" }}
    </button>
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
  overflow: hidden;
  display: grid;
  grid-template-columns: 12rem 4fr 12rem;
  grid-template-rows: 4rem 4rem 4rem;
  width: 100%;
  column-gap: 1rem;
  border: transparent 2px solid;
  .cover {
    background-color: hsl(40, 13%, 82%);
    grid-area: 1 / 1 / 5 / 2;
    overflow: hidden;
    z-index: 0;
    background-repeat: no-repeat;
    background-size: contain;
    z-index: -1;
  }
  .play-on-spotify {
    justify-self: start;
    align-self: center;
    color: #1db954;
    grid-area: 1 / 2 / 2 / 3;
    padding: 0 1.6rem;
    font-size: 1.2rem;
    font-weight: 600;
    letter-spacing: 0.1rem;
    border-radius: 1.9rem;
    margin: 0;
    &:hover {
      color: #fff;
      background-color: #1db954;
    }
  }
  .title {
    color: var(--darker-text);
    font-weight: 500;
    grid-area: 2 / 2 / 3 / 3;
    margin: 0;
    line-height: 4rem;
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
    grid-area: 3 / 2 / 4 / 3;
    line-height: 3rem;
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
    border: #1db954 2px solid;
    border-radius: 1rem;
    .select-toggle {
      border-radius: 0;
    }
  }
}
</style>
