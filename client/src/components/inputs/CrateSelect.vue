<template>
  <div class="wrapper">
    <label for="selectID">{{ label }} </label>
    <select v-model="user.authd.settings.selectedCrate" id="selectID">
      <option value="all">Collection (all)</option>
      <option
        v-for="crate in crates.crateList"
        :key="crate._id"
        :value="crate._id"
      >
        {{ crate.name }}
      </option>
    </select>
  </div>
</template>

<script setup lang="ts">
import { defineProps, watch } from "vue"
import { crateStore } from "@/stores/crateStore"
import { recordStore } from "@/stores/recordStore"
import { trackStore } from "@/stores/trackStore"
import { userStore } from "@/stores/userStore"
const crates = crateStore()
const records = recordStore()
const tracks = trackStore()
const user = userStore()

defineProps<{
  selectID: string
  label: string
  width?: string
}>()

watch(
  () => user.authd.settings.selectedCrate, // when selectedCrate changes
  () => {
    if (user.hasUser()) user.updateSettings() // hasUser() check to avoid call on logout
    records.checkboxed = [] // clear checkboxed
    records.checkAll = false // set select all checkbox to false
    tracks.generateCrateTrackList()
  }
)
</script>

<style scoped lang="scss">
.wrapper {
  display: block;
  select {
    width: v-bind(width);
  }
}
</style>
