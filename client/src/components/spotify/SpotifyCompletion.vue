<template>
  <div class="modal-header">
    <h2>Importing Spotify data complete!</h2>
    <button class="close" type="button" @click="$parent!.$emit('close')">
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
      Some tracks may have not been found. You can add BPM and key to these
      tracks manually using the edit track form. Doing so will greatly assist
      {{ appName }} in providing suggestions.
    </p>
  </div>
  <div class="modal-footer">
    <button class="close" type="button" @click="$parent!.$emit('close')">
      Close
    </button>
  </div>
</template>

<script setup lang="ts">
import { inject } from "vue"
import XIcon from "@/components/icons/XIcon.vue"

const appName = inject("appName")
</script>

<style scoped lang="scss"></style>
