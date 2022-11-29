<template>
  <div class="modal-header">
    <h2>Importing Spotify data complete!</h2>
    <button
      class="close"
      type="button"
      @click="spotify.completionModal = false"
    >
      <XIcon />
    </button>
  </div>
  <div class="modal-body">
    <p>
      Spotify audio features have been imported for all found and user matched
      tracks. Tracks with imported Spotify data are displayed like this:
    </p>
    <p>TODO</p>
    <p>
      Some tracks may have not been found. You can add a Spotify track ID
      manually in the edit track form. To get the ID of a track you know is on
      spotify but {{ appName }} couldn't find, copy the ID from the end of the
      URL. An example is provided below with the ID highlighted
    </p>
    <p class="url">
      https://open.spotify.com/track/<span>4cOdK2wGLETKBW3PvgPWqT</span>
    </p>
    <p>
      Some tracks are not on Spotify. You can add BPM and key to these tracks
      manually using the edit track form. Doing so will greatly assist
      {{ appName }} in providing suggestions.
    </p>
  </div>
  <div class="modal-footer">
    <button
      class="close"
      type="button"
      @click="spotify.completionModal = false"
    >
      Close
    </button>
  </div>
</template>

<script setup lang="ts">
import { inject } from "vue"
import { spotifyStore } from "@/stores/spotifyStore"
import XIcon from "@/components/icons/XIcon.vue"
const spotify = spotifyStore()
const appName = inject("appName")
</script>

<style scoped lang="scss">
.url {
  text-align: center;
  span {
    background-color: var(--highlight);
  }
}
</style>
