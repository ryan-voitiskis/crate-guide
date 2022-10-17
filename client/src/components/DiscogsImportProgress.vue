<template>
  <div class="modal-header">
    <h2>Importing your records!</h2>
    <button class="close" type="button" @click="$parent!.$emit('close')">
      <XIcon />
    </button>
  </div>
  <div class="modal-body">
    <p>
      {{ appName }} is importing your folder from Discogs. This may take some
      time due to limitations of the Discogs API.
    </p>
    <p class="discogs-ip-statement">
      This application uses Discogs’ API but is not affiliated with, sponsored
      or endorsed by Discogs. ‘Discogs’ is a trademark of Zink Media, LLC.
    </p>
    <div v-if="!discogs.loading" class="progress-bar">
      <div class="progress"></div>
    </div>
    <LoaderCentered v-else />
    <ErrorFeedback :show="discogs.errorMsg !== ''" :msg="discogs.errorMsg" />
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from "vue"
import { discogsStore } from "@/stores/discogsStore"
import XIcon from "@/components/svg/XIcon.vue"
import LoaderCentered from "./LoaderCentered.vue"
import ErrorFeedback from "./forms/feedbacks/ErrorFeedback.vue"

const appName = inject("appName")
const discogs = discogsStore()

const progress = computed(() => (discogs.importProgress * 100).toString() + "%")
</script>

<style scoped lang="scss">
.discogs-ip-statement {
  margin-bottom: 2.5rem;
}
.progress-bar {
  width: 100%;
  height: 2.8rem;
  border-radius: 1.9rem;
  overflow: hidden;
  background: var(--progress-bg);
}

.progress {
  width: v-bind(progress);
  height: 2.8rem;
  background: var(--progress-fg);
  transition: width 0.6s;
}
</style>
