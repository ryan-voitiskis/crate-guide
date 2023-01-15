<template>
  <div class="modal-header">
    <h2>Select crate</h2>
    <button class="close" type="button" @click="records.toCrate = []">
      <XIcon />
    </button>
  </div>
  <span class="hint">
    Select the crate to add {{ recordNames.join(", ") }} to.
  </span>
  <form @submit.prevent="submit">
    <div class="modal-body inline-labels">
      <SelectInput
        id="select_crate"
        v-model="form.crate"
        label="Select crate"
        :options="options"
      />
      <ErrorFeedback :show="crates.errorMsg !== ''" :msg="crates.errorMsg" />
    </div>
    <div class="modal-footer">
      <button class="close" type="button" @click="records.toCrate = []">
        Close
      </button>
      <button class="primary" type="submit">
        {{ crates.loading ? null : "Add to crate" }}
        <LoaderIcon v-show="crates.loading" />
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, watch, onBeforeUnmount } from "vue"
import { crateStore } from "@/stores/crateStore"
import { recordStore } from "@/stores/recordStore"
import { userStore } from "@/stores/userStore"
import ErrorFeedback from "@/components/feedbacks/ErrorFeedback.vue"
import LoaderIcon from "@/components/icons/LoaderIcon.vue"
import SelectInput from "../inputs/SelectInput.vue"
import XIcon from "@/components/icons/XIcon.vue"
const user = userStore()
const crates = crateStore()
const records = recordStore()

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

const options = selectCrates.map((i) => ({ id: i._id, name: i.name }))

// array of either catno if available or title of records to be deleted
const recordNames = records.toDelete.map((i) => records.getNameById(i))

function submit() {
  records.checkAll = false
  if (form.crate !== "") {
    if (records.toCrate.length)
      crates.pushToCrate(records.toCrate as string[], form.crate)
  } else crates.errorMsg = "No crate selected"
}

// when crate selected, remove "no crate selected" message
watch(
  () => form.crate !== "",
  () => (crates.errorMsg = "")
)

onBeforeUnmount(() => {
  records.toCrate = []
  crates.errorMsg = ""
})
</script>

<style scoped lang="scss"></style>
