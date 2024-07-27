<template>
  <div class="radio-toggle">
    <button
      class="icon-button"
      :class="{ active: user.authd.settings.listLayout === 0 }"
      @click="user.authd.settings.listLayout = 0"
    >
      <LayoutListIcon />Record
    </button>
    <button
      class="icon-button"
      :class="{ active: user.authd.settings.listLayout === 1 }"
      @click="user.authd.settings.listLayout = 1"
    >
      <ListIcon />Track
    </button>
  </div>
</template>

<script setup lang="ts">
import { userStore } from "@/stores/userStore"
import LayoutListIcon from "../icons/LayoutListIcon.vue"
import ListIcon from "../icons/ListIcon.vue"
const user = userStore()
</script>

<style scoped lang="scss"></style>
