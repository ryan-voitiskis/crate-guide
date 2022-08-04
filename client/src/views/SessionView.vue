<template>
  <div class="session">
    <div class="suggestions"></div>
    <div class="decks">
      <RecordDeck :deckID="1" />
      <RecordDeck :deckID="2" />
    </div>
  </div>
</template>

<script setup lang="ts">
import RecordDeck from "@/components/RecordDeck.vue"
</script>

<style scoped lang="scss">
.decks {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-around;
  width: 100%;
  gap: 1rem;
}
</style>
