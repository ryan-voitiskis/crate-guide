<template>
  <div class="session">
    <div class="suggestions"></div>
    <div class="decks">
      <RecordDeck :deckID="1" />
      <RecordDeck :deckID="2" />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue"
import RecordDeck from "@/components/RecordDeck.vue"

export default defineComponent({
  name: "SessionView",
  components: {
    RecordDeck,
  },
})
</script>

<style scoped lang="scss">
.decks {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-around;
  width: 100%;
}
</style>
