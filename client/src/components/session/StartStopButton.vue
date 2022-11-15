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
  width: calc(45 / 450 * 100%);
  height: calc(33 / 350 * 100%);
  border: 3.4px solid #333;
  border-radius: 0;
  position: absolute;
  bottom: calc(1 / 35 * 100%);
  left: calc(1 / 45 * 100%);
  padding: 0;
  margin: 0;
  z-index: 3;
  svg {
    width: 100%;
    height: 100%;
  }
}
</style>
