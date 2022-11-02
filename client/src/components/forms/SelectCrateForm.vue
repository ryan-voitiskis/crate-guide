<template>
  <div class="modal-header">
    <h2>Select crate</h2>
    <button class="close" type="button" @click="$parent!.$emit('close')">
      <XIcon />
    </button>
  </div>
  <form @submit.prevent="submit">
    <span class="hint"
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
      <ErrorFeedback :show="crates.errorMsg !== ''" :msg="crates.errorMsg" />
    </div>
    <div class="modal-footer">
      <button class="close" type="button" @click="$parent!.$emit('close')">
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
import ErrorFeedback from "@/components/feedbacks/ErrorFeedback.vue"
import LoaderIcon from "@/components/icons/LoaderIcon.vue"
import XIcon from "@/components/icons/XIcon.vue"
import { userStore } from "@/stores/userStore"
import { crateStore } from "@/stores/crateStore"
import { recordStore } from "@/stores/recordStore"
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

// array of either catno if available or title of records to be deleted
const recordNames = records.toDelete.map((i) => records.getNameById(i))

const submit = async () => {
  records.checkAll = false
  if (form.crate !== "") {
    if (records.toCrate.length) {
      const response = await crates.pushToCrate(
        records.toCrate as string[],
        form.crate,
        user.authd.token
      )
      if (response === 200 || response === 1) records.toCrate = []
    }
  } else crates.errorMsg = "No crate selected"
}

// when crate selected, remove "no crate selected" message
watch(
  () => form.crate !== "",
  () => (crates.errorMsg = "")
)

onBeforeUnmount(() => {
  records.toCrate = []
  records.checkboxed = []
  crates.errorMsg = ""
})
</script>

<style scoped lang="scss"></style>
