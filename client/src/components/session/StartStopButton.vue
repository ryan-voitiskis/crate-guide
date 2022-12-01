<template>
  <button
    class="start"
    @click="session.decks[deckID].playing = !session.decks[deckID].playing"
  >
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <text x="6" y="52">start • stop</text>
    </svg>
  </button>
</template>

<script setup lang="ts">
import { defineProps } from "vue"
import { sessionStore } from "@/stores/sessionStore"
const session = sessionStore()

defineProps<{
  deckID: number
}>()
</script>

<style scoped lang="scss">
.start {
  background-color: var(--deck-button);
  width: 90px;
  height: 66px;
  border: 3.4px solid var(--deck-button-border);
  border-radius: 0;
  position: absolute;
  bottom: 20px;
  left: 20px;
  padding: 0;
  margin: 0;
  z-index: 3;
  svg {
    width: 100%;
    height: 100%;
    text {
      font-weight: 500;
      fill: var(--deck-button-text);
    }
  }
}
</style>
