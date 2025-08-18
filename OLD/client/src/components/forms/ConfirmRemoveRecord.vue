<template>
  <div class="modal-header">
    <h2>Remove from crate</h2>
    <button class="close" type="button" @click="records.fromCrate = []">
      <XIcon />
    </button>
  </div>
  <div class="modal-body">
    <span class="question">
      Are you sure you wish to remove {{ recordText }} from {{ crateName }}?
    </span>
    <ErrorFeedback :show="crates.errorMsg !== ''" :msg="crates.errorMsg" />
  </div>
  <div class="modal-footer-plain">
    <button class="close" type="button" @click="records.fromCrate = []">
      Cancel
    </button>
    <button @click="submit()" class="primary delete" type="submit">
      {{ crates.loading ? null : "Delete" }}
      <LoaderIcon v-show="crates.loading" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount } from "vue"
import { crateStore } from "@/stores/crateStore"
import { recordStore } from "@/stores/recordStore"
import { userStore } from "@/stores/userStore"
import ErrorFeedback from "@/components/feedbacks/ErrorFeedback.vue"
import LoaderIcon from "@/components/icons/LoaderIcon.vue"
import XIcon from "@/components/icons/XIcon.vue"
const user = userStore()
const records = recordStore()
const crates = crateStore()

// text csv of record catno/name or "n records" for many records
const recordText =
  records.fromCrate.length < 24
    ? records.fromCrate.map((i) => records.getNameById(i)).join(", ")
    : `${records.fromCrate.length.toString()} records`

// name of crate records are to be removed from
const crateName = crates.getById(user.authd.settings.selectedCrate)?.name

function submit() {
  records.checkAll = false
  if (records.fromCrate.length)
    crates.removeFromCrate(
      records.fromCrate as string[],
      user.authd.settings.selectedCrate
    )
}

onBeforeUnmount(() => {
  records.fromCrate = []
  crates.errorMsg = ""
})
</script>

<style scoped lang="scss"></style>
