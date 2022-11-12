<template>
  <button
    class="rpm-switch"
    :class="{ second: speed === 45 }"
    @click="session.decks[deckID].rpm = speed"
  >
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <text x="-120" y="80">{{ speed }}</text>
    </svg>
    <div
      class="indicator-light"
      :class="{ active: session.decks[deckID].rpm === speed }"
    ></div>
  </button>
</template>

<script setup lang="ts">
import { defineProps } from "vue"
import { sessionStore } from "@/stores/sessionStore"
const session = sessionStore()

defineProps<{
  deckID: number
  speed: number
}>()
</script>

<style scoped lang="scss">
.rpm-switch {
  width: 25/450 * 100%;
  height: 8/350 * 100%;
  border: 0.3rem solid #333;
  border-radius: 0;
  position: absolute;
  bottom: 1/35 * 100%;
  left: 59/450 * 100%;
  padding: 0;
  margin: 0;
  z-index: 2;
  svg {
    font-size: 8rem;
    width: 100%;
    height: 100%;
  }
  &.second {
    left: 82/450 * 100%;
  }
}
.indicator-light {
  width: 22%;
  height: 36%;
  background: #333;
  position: absolute;
  right: 10%;
  top: 30%;
  &.active {
    background: #ff0000;
    box-shadow: 0 0 4px 4px rgba(255, 0, 0, 0.4);
  }
}
</style>
