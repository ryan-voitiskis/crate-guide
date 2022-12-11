<template>
  <div class="history-list-container">
    <div class="header">
      <span class="label">Transition history</span>
      <div class="controls">
        <button
          class="icon-only-button"
          @click="session.confirmClearHistory = true"
          v-show="session.set.length"
        >
          <TrashIcon />
        </button>
        <button
          class="icon-only-button"
          v-show="session.set.length"
          @click="session.saveHistoryForm = true"
        >
          <SaveIcon />
        </button>
        <button class="icon-only-button" @click="session.setManager = true">
          <FolderIcon />
        </button>
      </div>
    </div>
    <div class="history-list" ref="list">
      <PlayedTrack
        v-for="(track, index) in session.set"
        :track="track"
        :index="index"
        :key="track.timeAdded"
        @newTrackMounted="scrollBottom"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue"
import { sessionStore } from "@/stores/sessionStore"
import SaveIcon from "../icons/SaveIcon.vue"
import TrashIcon from "../icons/TrashIcon.vue"
import PlayedTrack from "./PlayedTrack.vue"
import FolderIcon from "../icons/FolderIcon.vue"
const session = sessionStore()

const list = ref<HTMLInputElement | null>(null)

function scrollBottom() {
  list.value ? (list.value.scrollTop = list.value.scrollHeight) : null
}
</script>

<style scoped lang="scss">
.history-list-container {
  flex-grow: 1;
  flex-shrink: 1;
  max-width: 720px;
  min-width: 360px;
  .header {
    display: flex;
    margin-bottom: 10px;
    gap: 10px;
    width: 100%;
    .label {
      line-height: 38px;
      font-size: 20px;
      font-weight: 600;
      width: 100%;
      flex-shrink: 1;
      overflow-x: hidden;
      text-overflow: ellipsis;
      flex-basis: content;
    }
    .controls {
      display: flex;
      justify-items: right;
      gap: 10px;
      margin-left: auto;
    }
  }
  .history-list {
    overflow-y: scroll;
    height: calc(100% - 48px);
  }
}

@media (max-width: 2200px) {
  .history-list-container {
    order: 3;
    flex-wrap: wrap;
    height: auto;
    max-height: 668px;
  }
}
</style>
