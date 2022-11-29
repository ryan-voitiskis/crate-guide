<template>
  <div class="modal-header">
    <h2>Importing audio feature from Spotify!</h2>
    <button
      class="close"
      type="button"
      @click="spotify.importProgressModal = false"
    >
      <XIcon />
    </button>
  </div>
  <div class="modal-body">
    <p>
      {{ appName }} is importing audio features for the selected records. This
      may take some time.
    </p>
    <span class="progress-text">{{ progress }}</span>
    <div v-if="!spotify.loading" class="progress-bar">
      <div class="progress"></div>
    </div>
    <LoaderCentered v-else />
    <ErrorFeedback :show="spotify.errorMsg !== ''" :msg="spotify.errorMsg" />
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onUnmounted } from "vue"
import { spotifyStore } from "@/stores/spotifyStore"
import XIcon from "@/components/icons/XIcon.vue"
import LoaderCentered from "@/components/utility/LoaderCentered.vue"
import ErrorFeedback from "@/components/feedbacks/ErrorFeedback.vue"

const appName = inject("appName")
const spotify = spotifyStore()

const progress = computed(() => `${(spotify.importProgress * 100).toFixed(0)}%`)

onUnmounted(() => (spotify.errorMsg = ""))
</script>

<style scoped lang="scss">
.progress-text {
  display: flex;
  justify-content: center;
  margin-bottom: 10px;
}

.progress-bar {
  width: 100%;
  height: 20px;
  overflow: hidden;
  border-radius: 10px;
  background: var(--progress-bg);
}

.progress {
  width: v-bind(progress);
  border-radius: 10px;
  height: 20px;
  background: var(--progress-fg);
  transition: width 0.6s;
  box-shadow: rgba(0, 0, 0, 0.08) 0px -3px 0px inset;
}
</style>
