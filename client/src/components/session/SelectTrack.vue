<template>
  <div class="modal-header">
    <h2>Select track</h2>
    <button class="close" type="button" @click="$parent!.$emit('close')">
      <XIcon />
    </button>
  </div>
  <div class="modal-body">
    <div class="track-list">
      <SelectTrackOption
        v-for="track in tracks.trackList"
        :track="track"
        :key="track._id"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import XIcon from "@/components/icons/XIcon.vue"
import SelectTrackOption from "@/components/session/SelectTrackOption.vue"
import { trackStore } from "@/stores/trackStore"
const tracks = trackStore()
</script>

<style scoped lang="scss"></style>
