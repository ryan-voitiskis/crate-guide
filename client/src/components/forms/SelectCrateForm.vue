<template>
  <form @submit.prevent="submit">
    <span class="form-hint"
      >Select the crate to add {{ recordNames.join(", ") }} to.</span
    >
    <div class="modal-body inline-labels">
      <label for="crate_select">Select crate </label>
      <select v-model="form.crate" id="crate_select">
        <option value="">---</option>
        <option
          v-for="crate in selectCrates"
          :key="crate._id"
          :value="crate._id"
        >
          {{ crate.name }}
        </option>
      </select>
      <ErrorFeedback :show="state.noneSelected" msg="No crate selected" />
      <ErrorFeedback :show="crates.errorMsg !== ''" :msg="crates.errorMsg" />
    </div>
    <div class="modal-controls">
      <button class="close" type="button" @click="$parent!.$emit('close')">
        Close
      </button>
      <button class="primary" type="submit" style="width: 16rem">
        {{ crates.loading ? null : "Add to crate" }}
        <LoaderIcon v-show="crates.loading" />
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, defineEmits, watch, onBeforeUnmount } from "vue"
import ErrorFeedback from "./feedbacks/ErrorFeedback.vue"
import LoaderIcon from "@/components/svg/LoaderIcon.vue"
import { userStore } from "@/stores/userStore"
import { crateStore } from "@/stores/crateStore"
import { recordStore } from "@/stores/recordStore"
const user = userStore()
const crates = crateStore()
const records = recordStore()

const emit = defineEmits<{
  (e: "close"): void
}>()

const state = reactive({
  noneSelected: false, // only true after a submit attempt
})

const form = reactive({
  crate: "",
})

// filter currently selected crate from select options
const selectCrates =
  user.authd.settings.selectedCrate === "all"
    ? crates.crateList
    : crates.crateList.filter(
        (i) => i._id !== user.authd.settings.selectedCrate
      )

// array of either catno if available or title of records to be deleted
const recordNames = records.toDelete.map((i) => records.getNameById(i))

const submit = async () => {
  records.checkAll = false
  if (form.crate) {
    if (records.toCrate.length) {
      const response = await crates.pushToCrate(
        records.toCrate as string[],
        form.crate,
        user.authd.token
      )
      if (response === 200 || response === 1) records.toCrate = []
    }
  } else state.noneSelected = true
}

// when crate selected, remove "no crate selected" message
watch(
  () => form.crate !== "",
  () => (state.noneSelected = false)
)

// when no crate selected, clear existing error msg for "no crate selected"
watch(
  () => state.noneSelected,
  () => (crates.errorMsg = "")
)

onBeforeUnmount(() => {
  records.toCrate = []
  records.checkboxed = []
  crates.errorMsg = ""
})
</script>

<style scoped lang="scss">
select {
  margin-bottom: 0;
  width: 100%;
  grid-column: 2 / 3;
}
</style>
