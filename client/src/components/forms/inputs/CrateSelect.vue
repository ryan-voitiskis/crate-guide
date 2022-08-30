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
import { defineProps } from "vue"
import { userStore } from "@/stores/userStore"
import { crateStore } from "@/stores/crateStore"
const user = userStore()
const crates = crateStore()

const props = defineProps<{
  selectID: string
}>()
</script>

<style scoped lang="scss">
select,
label {
  margin-bottom: 0;
}
</style>
