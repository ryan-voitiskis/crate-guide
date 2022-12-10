<template>
  <div class="modal-header">
    <h2>Saved sets</h2>
    <button class="close" type="button" @click="session.historyManager = false">
      <XIcon />
    </button>
  </div>
  <div class="modal-body">
    <LoaderCentered v-if="session.loading" class="loader" />
    <div v-if="!session.loading" class="histories-list">
      <TransitionHistorySingle
        @view="state.selectedHistoryIndex = index"
        v-for="(history, index) in session.savedTransitionHistories"
        :history="history"
        :index="index"
        :selectedHistoryIndex="state.selectedHistoryIndex"
        :key="history._id"
      />
    </div>
    <div class="history" ref="list" v-if="!session.loading">
      <SavedPlayedTrack
        v-for="(track, index) in selectedHistory"
        :track="track"
        :index="index"
        :key="track.timeAdded"
      />
    </div>
  </div>

  <div class="modal-footer">
    <button class="close" type="button" @click="session.historyManager = false">
      Close
    </button>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, computed } from "vue"
import XIcon from "@/components/icons/XIcon.vue"
import { sessionStore } from "@/stores/sessionStore"
import LoaderCentered from "@/components/utility/LoaderCentered.vue"
import TransitionHistorySingle from "@/components/session/TransitionHistorySingle.vue"
import { trackStore } from "@/stores/trackStore"
import SavedPlayedTrack from "./SavedPlayedTrack.vue"
const session = sessionStore()
const tracks = trackStore()

const state = reactive({
  selectedHistoryIndex: -1,
})

const selectedHistory = computed(() =>
  state.selectedHistoryIndex >= 0
    ? session.savedTransitionHistories[state.selectedHistoryIndex].history.map(
        (i) => ({ ...i, track: tracks.getTrackByIdFromTrackList(i._id) })
      )
    : null
)

onMounted(async () => {
  session.loading = true
  const responseStatus = await session.fetchHistories()
  session.loading = false
  if (responseStatus === 200) {
    console.log(200)
  } else {
    console.log(400)
  }
})
</script>

<style scoped lang="scss">
.modal-body {
  display: grid;
  gap: 3px;
  grid-template-columns: 270px 540px;
  height: 100%;
  .loader {
    grid-column: 1/3;
  }
  .histories-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    grid-column: 1/2;
    height: 100%;
    overflow: hidden;
    overflow-y: scroll;
  }
  .history {
    grid-column: 2/3;
    height: 100%;
    overflow: hidden;
    overflow-y: scroll;
    padding-right: 10px; // for scroll bar
  }
}
.import-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: scroll;
  width: 100%;
}
</style>
