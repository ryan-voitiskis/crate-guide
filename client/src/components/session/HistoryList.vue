<template>
  <div class="history-list">
    <div class="header">
      <span class="label">Transition history</span>
      <button
        class="icon-button"
        @click="session.confirmClearHistory = true"
        v-show="session.history.length"
      >
        <TrashIcon />Clear
      </button>
      <button class="icon-button" v-show="session.history.length">
        <SaveIcon />Save
      </button>
    </div>
    <PlayedTrack
      v-for="(track, index) in session.history"
      :track="track"
      :index="index"
      :key="track.timeAdded"
    />
  </div>
</template>

<script setup lang="ts">
import { sessionStore } from "@/stores/sessionStore"
import SaveIcon from "../icons/SaveIcon.vue"
import TrashIcon from "../icons/TrashIcon.vue"
import PlayedTrack from "./PlayedTrack.vue"
const session = sessionStore()
</script>

<style scoped lang="scss">
.header {
  display: flex;
  margin-bottom: 10px;
  gap: 10px;
  .label {
    line-height: 38px;
    font-size: 18px;
    font-weight: 500;
    width: 100%;
  }
  button {
    margin-left: auto;
  }
}
.history-list {
  flex-grow: 1;
  flex-shrink: 1;
  overflow-y: scroll;
  height: calc(100% - 12px);
  max-width: 600px;
}
</style>
