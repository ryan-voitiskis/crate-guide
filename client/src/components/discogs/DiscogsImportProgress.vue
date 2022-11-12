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
import LoaderCentered from "@/components/utility/LoaderCentered.vue"
import ErrorFeedback from "@/components/feedbacks/ErrorFeedback.vue"

const appName = inject("appName")
const discogs = discogsStore()

const progress = computed(() => `${(discogs.importProgress * 100).toFixed(0)}%`)
</script>

<style scoped lang="scss">
.discogs-ip-statement {
  margin-bottom: 25px;
}

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
