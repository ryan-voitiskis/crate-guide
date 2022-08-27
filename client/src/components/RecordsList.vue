<template>
  <div class="record-list">
    <RecordSingle
      v-for="record in toDisplay"
      v-bind="record"
      :key="record._id"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import RecordSingle from "./RecordSingle.vue"
import { userStore } from "@/stores/userStore"
import { crateStore } from "@/stores/crateStore"
import { recordStore } from "@/stores/recordStore"
import Record from "@/interfaces/Record"
const user = userStore()
const crates = crateStore()
const records = recordStore()

// returns records to display
const toDisplay = computed((): Record[] =>
  user.authd.settings.selectedCrate !== "all"
    ? crates
        .getRecordsByCrate(user.authd.settings.selectedCrate)
        .map((i) => records.getById(i))
    : records.recordList
)
</script>

<style scoped lang="scss">
.record-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 100%;
}
</style>
