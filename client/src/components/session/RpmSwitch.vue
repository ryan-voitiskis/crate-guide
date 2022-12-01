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
  background-color: var(--deck-button);
  width: 50px;
  height: 16px;
  border: 3px solid var(--deck-button-border);
  border-radius: 0;
  position: absolute;
  bottom: 20px;
  left: 118px;
  padding: 0;
  margin: 0;
  z-index: 2;
  svg {
    font-size: 80px;
    width: 100%;
    height: 100%;
    text {
      font-weight: 500;
      fill: var(--deck-button-text);
    }
  }
  &.second {
    left: 164px;
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
