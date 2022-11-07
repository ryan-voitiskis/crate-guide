<template>
  <div class="track-list">
    <SuggestionSingle
      v-for="track in suggestions"
      v-bind="track"
      :key="track._id"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, defineProps } from "vue"
import { crateStore } from "@/stores/crateStore"
import { recordStore } from "@/stores/recordStore"
import { trackStore } from "@/stores/trackStore"
import { userStore } from "@/stores/userStore"
import SuggestionSingle from "@/components/session/SuggestionSingle.vue"
const crates = crateStore()
const records = recordStore()
const tracks = trackStore()
const user = userStore()

const props = defineProps<{
  deckID: number
}>()

const state = reactive({
  selectAll: false,
  searchTerm: "",
  sortBy: "title",
})

const suggestions = tracks.trackList.slice(0, 4)
</script>

<style scoped lang="scss">
.track-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
}
</style>
