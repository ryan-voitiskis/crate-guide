<template>
  <div class="modal-header">
    <h2>Transition history</h2>
    <button
      class="close"
      type="button"
      @click="session.historyListModal = false"
    >
      <XIcon />
    </button>
  </div>
  <div class="modal-body-sticky-header">
    <div class="controls">
      <button
        class="icon-button"
        @click="session.confirmClearHistory = true"
        v-show="session.set.length"
      >
        <TrashIcon />Clear
      </button>
      <button
        class="icon-button"
        v-show="session.set.length"
        @click="session.saveHistoryForm = true"
      >
        <SaveIcon />Save
      </button>
      <button class="icon-button" @click="session.setManager = true">
        <FolderIcon />View saved
      </button>
    </div>
  </div>
  <div class="modal-body">
    <div class="history-list">
      <PlayedTrack
        v-for="(track, index) in session.set"
        :track="track"
        :index="index"
        :key="track.timeAdded"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { sessionStore } from "@/stores/sessionStore"
import XIcon from "@/components/icons/XIcon.vue"
import PlayedTrack from "./PlayedTrack.vue"
import TrashIcon from "../icons/TrashIcon.vue"
import SaveIcon from "../icons/SaveIcon.vue"
import FolderIcon from "../icons/FolderIcon.vue"
const session = sessionStore()
</script>

<style scoped lang="scss">
.controls {
  display: flex;
  justify-content: right;
  gap: 10px;
  margin-bottom: 20px;
}
.history-list {
  overflow-y: scroll;
  height: 100%;
}
</style>
