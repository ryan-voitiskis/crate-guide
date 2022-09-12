<template>
  <label for="selectID"
    >Select crate
    <select v-model="user.authd.settings.selectedCrate" id="selectID">
      <option value="all">Collection (all)</option>
      <option
        v-for="crate in crates.crateList"
        :key="crate.id"
        :value="crate.id"
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
import { userStore } from "@/stores/userStore"
const crates = crateStore()
const records = recordStore()
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
  }
)
</script>

<style scoped lang="scss">
select,
label {
  margin-bottom: 0;
}
</style>
