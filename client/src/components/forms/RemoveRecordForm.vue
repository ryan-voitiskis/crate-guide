<template>
  <form @submit.prevent="submit">
    <span class="form-question">
      Are you sure you wish to remove
      {{ recordNames.join(", ") }} from {{ crateName }}?
    </span>
    <div class="modal-body ctrd-btns">
      <button class="close" type="button" @click="$parent!.$emit('close')">
        Cancel
      </button>
      <button class="primary" type="submit" style="width: 12rem">
        {{ records.loading ? null : "Remove" }}
        <LoaderIcon v-show="records.loading" />
      </button>
    </div>
    <div class="modal-body">
      <ErrorFeedback
        :show="crates.errorMsg !== ''"
        :msg="crates.errorMsg"
        :notReserved="true"
      />
    </div>
  </form>
</template>

<script setup lang="ts">
import { defineEmits, onBeforeUnmount } from "vue"
import ErrorFeedback from "@/components/forms/feedbacks/ErrorFeedback.vue"
import LoaderIcon from "@/components/svg/LoaderIcon.vue"
import { userStore } from "@/stores/userStore"
import { recordStore } from "@/stores/recordStore"
import { crateStore } from "@/stores/crateStore"
const user = userStore()
const records = recordStore()
const crates = crateStore()

const emit = defineEmits<{
  (e: "close"): void
}>()

// array of either catno if available or title of records to be removed
const recordNames = records.fromCrate.map((i) => records.getNameById(i))

// name of crate records are to be removed from
const crateName = crates.getById(user.authd.settings.selectedCrate)?.name

const submit = async () => {
  records.checkAll = false
  if (records.fromCrate.length) {
    const response = await crates.removeFromCrate(
      records.fromCrate as string[],
      user.authd.settings.selectedCrate,
      user.authd.token
    )
    if (response === 200 || response === 1) records.fromCrate = []
  }
}

onBeforeUnmount(() => {
  records.fromCrate = []
  records.checkboxed = []
  crates.errorMsg = ""
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
