<template>
  <form @submit.prevent="submit">
    <span class="form-question">
      Are you sure you wish to delete {{ recordNames.join(", ") }}?
    </span>
    <div class="modal-body ctrd-btns">
      <button class="close" type="button" @click="$parent!.$emit('close')">
        Cancel
      </button>
      <button class="primary delete" type="submit" style="width: 12rem">
        {{ records.loading ? null : "Delete" }}
        <LoaderIcon v-show="records.loading" />
      </button>
    </div>
    <div class="modal-body">
      <ErrorFeedback
        :show="records.errorMsg !== ''"
        :msg="records.errorMsg"
        :notReserved="true"
      />
    </div>
  </form>
</template>

<script setup lang="ts">
import { defineEmits, onBeforeUnmount } from "vue"
import ErrorFeedback from "@/components/forms/feedbacks/ErrorFeedback.vue"
import { userStore } from "@/stores/userStore"
import { recordStore } from "@/stores/recordStore"
const user = userStore()
const records = recordStore()

const emit = defineEmits<{
  (e: "close"): void
}>()

// array of either catno if available or title of records to be deleted
const recordNames = records.toDelete.map((i) => records.getNameById(i))

const submit = async () => {
  records.checkAll = false
  if (records.toDelete) {
    const response = await records.deleteRecords(user.authd.token)
    if (response === 200) emit("close")
  }
}

onBeforeUnmount(() => {
  records.toDelete = []
  records.checkboxed = []
  records.errorMsg = ""
})
</script>

<style scoped lang="scss">
.form-question {
  padding: 0 4rem;
  margin: 0 0 4rem 0;
  justify-content: center;
  display: flex;
  text-align: center;
}
.ctrd-btns {
  display: flex;
  justify-content: center;
  gap: 2rem;
}
</style>
