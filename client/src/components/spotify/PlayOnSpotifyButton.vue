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
  padding: 0 16px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 1px;
  border-radius: 19px;
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
