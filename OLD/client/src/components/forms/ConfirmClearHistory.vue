<template>
  <div class="modal-header">
    <h2>Clear history</h2>
    <button
      class="close"
      type="button"
      @click="session.confirmClearHistory = false"
    >
      <XIcon />
    </button>
  </div>
  <div class="modal-body">
    <span class="question">
      Are you sure you wish to clear the transition history?
    </span>
  </div>
  <div class="modal-footer-plain">
    <button
      class="close"
      type="button"
      @click="session.confirmClearHistory = false"
    >
      Cancel
    </button>
    <button
      @click=";(session.set = []), (session.confirmClearHistory = false)"
      class="primary delete"
      type="submit"
    >
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
