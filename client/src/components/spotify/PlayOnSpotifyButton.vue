<template>
  <a class="play-on-spotify icon-button btn" :href="href" target="_blank">
    <SpotifyLogo />PLAY ON SPOTIFY
  </a>
</template>

<script setup lang="ts">
import { defineProps } from "vue"
import SpotifyLogo from "../icons/SpotifyLogo.vue"
defineProps<{
  href: string
}>()
</script>

<style scoped lang="scss">
.play-on-spotify {
  justify-self: start;
  align-self: center;
  color: var(--spotify-green);
  padding: 0 1.6rem;
  font-size: 1.2rem;
  font-weight: 600;
  letter-spacing: 0.1rem;
  border-radius: 1.9rem;
  margin: 0;
  svg {
    color: var(--spotify-light-green);
  }
  &:hover {
    color: white;
    background-color: var(--spotify-green);
    svg {
      color: white;
    }
  }
}
</style>
