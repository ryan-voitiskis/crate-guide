<template>
  <div class="modal-header">
    <h2>Delete saved set</h2>
    <button
      class="close"
      type="button"
      @click="session.confirmDeleteSet = false"
    >
      <XIcon />
    </button>
  </div>
  <div class="modal-body">
    <span class="question">
      Are you sure you wish to delete this saved set?
    </span>
  </div>
  <div class="modal-footer-plain">
    <button
      class="close"
      type="button"
      @click="session.confirmDeleteSet = false"
    >
      Cancel
    </button>
    <button @click="session.deleteSet" class="primary delete" type="submit">
      Clear
    </button>
  </div>
</template>

<script setup lang="ts">
import { sessionStore } from "@/stores/sessionStore"
import XIcon from "@/components/icons/XIcon.vue"
const session = sessionStore()
</script>

<style scoped lang="scss"></style>
