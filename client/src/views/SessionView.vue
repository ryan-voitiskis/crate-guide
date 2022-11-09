<template>
  <div class="session">
    <div class="suggestions"></div>
    <div class="decks">
      <!-- <SuggestionList :deckID="1" /> -->
      <RecordDeck :deckID="1" />
      <!-- <SuggestionList :deckID="2" /> -->
      <RecordDeck :deckID="2" />
    </div>
  </div>

  <ModalBox
    v-if="tracks.loadTrackTo !== -1"
    @close="tracks.loadTrackTo = -1"
    width="1280px"
    :fullHeight="true"
  >
    <SelectTrack />
  </ModalBox>
</template>

<script setup lang="ts">
import { trackStore } from "@/stores/trackStore"
import ModalBox from "@/components/utility/ModalBox.vue"
import RecordDeck from "@/components/session/RecordDeck.vue"
import SelectTrack from "@/components/session/SelectTrack.vue"
import SuggestionList from "@/components/session/SuggestionList.vue"

const tracks = trackStore()
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
