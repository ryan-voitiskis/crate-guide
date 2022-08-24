<template>
  <div class="record-list">
    <RecordSingle
      v-for="record in records.recordList"
      v-bind="record"
      :key="record._id"
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
  max-width: 100%;
}
</style>
