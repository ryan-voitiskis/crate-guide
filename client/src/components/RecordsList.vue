<template>
  <div class="record-list">
    <RecordSingle
      v-for="record in records.recordList"
      :key="record._id"
      :catno="record.catno"
      :title="record.title"
      :artists="record.artists"
      :label="record.label"
      :year="record.year"
      :mixable="record.mixable"
      :tracks="record.tracks"
    />
  </div>
</template>

<script setup lang="ts">
import RecordSingle from "./RecordSingle.vue"
import { recordStore } from "@/stores/recordStore"
const records = recordStore()
</script>

<style scoped lang="scss">
.record-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 895px;
}
</style>
