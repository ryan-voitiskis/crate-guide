<template>
  <div class="modal-header">
    <h2>Saved sets</h2>
    <button class="close" type="button" @click="session.setManager = false">
      <XIcon />
    </button>
  </div>
  <div class="modal-body">
    <span
      class="no-saved-sets"
      v-if="
        !session.loading &&
        session.errorMsg === '' &&
        session.savedSets.length === 0
      "
    >
      There are no saved sets.
    </span>
    <LoaderCentered v-if="session.loading" class="loader" />
    <ErrorFeedback
      :show="session.errorMsg !== ''"
      :msg="session.errorMsg"
      :noAnimation="true"
    />
    <div v-if="!session.loading && session.errorMsg === ''" class="sets-list">
      <SavedSet
        @view="session.selectedSetIndex = index"
        v-for="(set, index) in session.savedSets"
        :set="set"
        :index="index"
        :key="set._id"
      />
    </div>
    <div
      class="history"
      ref="list"
      v-if="!session.loading && session.errorMsg === ''"
    >
      <SavedPlayedTrack
        v-for="(track, index) in selectedSet"
        :playedTrack="track"
        :index="index"
        :key="track.timeAdded"
      />
    </div>
  </div>

  <div class="modal-footer">
    <button class="close" type="button" @click="session.setManager = false">
      Close
    </button>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, computed } from "vue"
import { sessionStore } from "@/stores/sessionStore"
import { trackStore } from "@/stores/trackStore"
import ErrorFeedback from "../feedbacks/ErrorFeedback.vue"
import LoaderCentered from "@/components/utility/LoaderCentered.vue"
import SavedPlayedTrack from "./SavedPlayedTrack.vue"
import SavedSet from "@/components/session/SavedSet.vue"
import XIcon from "@/components/icons/XIcon.vue"
const session = sessionStore()
const tracks = trackStore()

const selectedSet = computed(() =>
  session.selectedSetIndex >= 0
    ? session.savedSets[session.selectedSetIndex].set.map((i) => ({
        ...i,
        track: tracks.getTrackByIdFromTrackList(i._id),
      }))
    : null
)

onMounted(async () => {
  session.loading = true
  await session.fetchSets()
  session.loading = false
})

onUnmounted(() => {
  session.errorMsg = ""
})
</script>

<style scoped lang="scss">
.modal-body {
  display: grid;
  gap: 3px;
  grid-template-columns: 300px 527px;
  height: 100%;
  .loader {
    grid-column: 1/3;
  }
  .sets-list {
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

.no-saved-sets {
  margin-top: 40px;
  width: 100%;
  font-size: 20px;
  grid-column: 1 /3;
  text-align: center;
}
</style>
