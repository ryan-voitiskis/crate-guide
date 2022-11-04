<template>
  <div class="modal-header">
    <h2>Delete record</h2>
    <button class="close" type="button" @click="$parent!.$emit('close')">
      <XIcon />
    </button>
  </div>
  <div class="modal-body">
    <span class="question">
      Are you sure you wish to delete {{ recordText }}?
    </span>
    <ErrorFeedback :show="records.errorMsg !== ''" :msg="records.errorMsg" />
  </div>
  <div class="modal-footer-plain">
    <button class="close" type="button" @click="$parent!.$emit('close')">
      Cancel
    </button>
    <button @click="submit()" class="primary delete" type="submit">
      {{ records.loading ? null : "Delete" }}
      <LoaderIcon v-show="records.loading" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount } from "vue"
import { recordStore } from "@/stores/recordStore"
import ErrorFeedback from "@/components/feedbacks/ErrorFeedback.vue"
import LoaderIcon from "@/components/icons/LoaderIcon.vue"
import XIcon from "@/components/icons/XIcon.vue"
const records = recordStore()

// text csv of record catno/name or "n records" for many records
const recordText =
  records.toDelete.length < 24
    ? records.toDelete.map((i) => records.getNameById(i)).join(", ")
    : `${records.toDelete.length.toString()} records`

const submit = async () => {
  records.checkAll = false
  if (records.toDelete) await records.deleteRecords()
}

onBeforeUnmount(() => {
  records.toDelete = []
  records.checkboxed = []
  records.errorMsg = ""
})
</script>

<style scoped lang="scss"></style>
