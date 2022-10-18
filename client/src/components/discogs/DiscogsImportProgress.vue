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
    <span class="progress-text">{{ progress }}</span>
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
import XIcon from "@/components/icons/XIcon.vue"
import LoaderCentered from "@/components/utils/LoaderCentered.vue"
import ErrorFeedback from "@/components/feedbacks/ErrorFeedback.vue"

const appName = inject("appName")
const discogs = discogsStore()

const progress = computed(() => `${(discogs.importProgress * 100).toFixed(0)}%`)
</script>

<style scoped lang="scss">
.discogs-ip-statement {
  margin-bottom: 2.5rem;
}

.progress-text {
  display: flex;
  justify-content: center;
  margin-bottom: 1rem;
}

.progress-bar {
  width: 100%;
  height: 2rem;
  overflow: hidden;
  border-radius: 1rem;
  background: var(--progress-bg);
}

.progress {
  width: v-bind(progress);
  border-radius: 1rem;
  height: 2rem;
  background: var(--progress-fg);
  transition: width 0.6s;
  box-shadow: rgba(0, 0, 0, 0.08) 0px -0.3rem 0px inset;
}
</style>
