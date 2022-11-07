<template>
  <label for="selectID"
    >Select crate
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
  </label>
</template>

<script setup lang="ts">
import { defineProps, watch } from "vue"
import { crateStore } from "@/stores/crateStore"
import { recordStore } from "@/stores/recordStore"
import { trackStore } from "@/stores/trackStore"
import { userStore } from "@/stores/userStore"
import trackService from "@/services/trackService"
const crates = crateStore()
const records = recordStore()
const tracks = trackStore()
const user = userStore()

defineProps<{
  selectID: string
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
select,
label {
  margin-bottom: 0;
}
</style>
