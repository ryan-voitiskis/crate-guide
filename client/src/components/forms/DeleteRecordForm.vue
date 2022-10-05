<template>
  <div class="modal-header">
    <h2>Delete record</h2>
    <button class="close" type="button" @click="$parent!.$emit('close')">
      <XIcon />
    </button>
  </div>
  <form @submit.prevent="submit">
    <span class="form-question">
      Are you sure you wish to delete {{ recordNames.join(", ") }}?
    </span>
    <div class="modal-body centered-btns">
      <button class="close" type="button" @click="$parent!.$emit('close')">
        Cancel
      </button>
      <button class="primary delete" type="submit" style="width: 12rem">
        {{ records.loading ? null : "Delete" }}
        <LoaderIcon v-show="records.loading" />
      </button>
    </div>
    <div class="modal-body">
      <ErrorFeedback :show="records.errorMsg !== ''" :msg="records.errorMsg" />
    </div>
  </form>
</template>

<script setup lang="ts">
import { onBeforeUnmount } from "vue"
import ErrorFeedback from "@/components/forms/feedbacks/ErrorFeedback.vue"
import XIcon from "@/components/svg/XIcon.vue"
import { userStore } from "@/stores/userStore"
import { recordStore } from "@/stores/recordStore"
const user = userStore()
const records = recordStore()

// array of either catno if available or title of records to be deleted
const recordNames = records.toDelete.map((i) => records.getNameById(i))

const submit = async () => {
  records.checkAll = false
  if (records.toDelete) await records.deleteRecords(user.authd.token)
}

onBeforeUnmount(() => {
  records.toDelete = []
  records.checkboxed = []
  records.errorMsg = ""
})
</script>

<style scoped lang="scss"></style>
