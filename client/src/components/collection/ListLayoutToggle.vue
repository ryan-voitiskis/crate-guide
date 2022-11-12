<template>
  <div>
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

<style scoped lang="scss">
button {
  font-weight: 500;
  color: var(--darker-text);
  &.active {
    color: white;
    background-color: var(--toggle-active-bg);
  }
}
button:first-child {
  border-radius: 10px 0 0 10px;
}
button:last-child {
  border-radius: 0 10px 10px 0;
}
</style>
