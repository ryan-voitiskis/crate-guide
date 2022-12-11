<template>
  <div class="wrapper">
    <SelectInput
      id="crate_select"
      v-model="user.authd.settings.selectedCrate"
      :label="label"
      :options="cratesList"
      :width="width"
    />
  </div>
</template>

<script setup lang="ts">
import { defineProps, watch, computed } from "vue"
import { crateStore } from "@/stores/crateStore"
import { recordStore } from "@/stores/recordStore"
import { trackStore } from "@/stores/trackStore"
import { userStore } from "@/stores/userStore"
import Option from "@/interfaces/SelectOption"
import SelectInput from "./SelectInput.vue"
const crates = crateStore()
const records = recordStore()
const tracks = trackStore()
const user = userStore()

defineProps<{
  selectID: string
  label: string
  width?: string
}>()

const cratesList = computed((): Option[] =>
  [{ id: "all", name: "Collection (all)" }].concat(
    crates.crateList.map((i) => ({ id: i._id, name: i.name }))
  )
)

watch(
  () => user.authd.settings.selectedCrate, // when selectedCrate changes
  () => {
    if (user.authd._id) user.updateSettings() // hasUser() check to avoid call on logout
    records.checkboxed = [] // clear checkboxed
    records.checkAll = false // set select all checkbox to false
    tracks.generateCrateTrackList()
  }
)
</script>

<style scoped lang="scss">
.wrapper {
  display: block;
}
</style>
