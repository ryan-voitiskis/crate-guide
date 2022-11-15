<template>
  <div class="suggestion-list">
    <SuggestionSingle
      v-for="track in suggestions"
      :track="track"
      :key="track._id"
      :deckID="deckID"
    />
  </div>
</template>

<script setup lang="ts">
import { reactive, defineProps } from "vue"
import { trackStore } from "@/stores/trackStore"
import { userStore } from "@/stores/userStore"
import SuggestionSingle from "@/components/session/SuggestionSingle.vue"
import { TrackPlus } from "@/interfaces/Track"
const tracks = trackStore()
const user = userStore()

const props = defineProps<{
  deckID: number
}>()

const state = reactive({})

const suggestions: TrackPlus[] = tracks.trackList.slice(0, 30)
</script>

<style scoped lang="scss">
.suggestion-list {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  width: 900px;
}
</style>
