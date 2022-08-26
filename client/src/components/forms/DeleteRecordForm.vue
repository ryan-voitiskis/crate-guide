<template>
  <form @submit.prevent="submit">
    <span class="form-question">
      Are you sure you wish to delete {{ name }}?
    </span>
    <div class="form-body ctrd-btns">
      <button class="close" type="button" @click="$parent!.$emit('close')">
        Cancel
      </button>
      <button class="primary delete" type="submit" style="width: 12rem">
        {{ records.loading ? null : "Delete" }}
        <LoaderIcon v-show="records.loading" />
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { defineEmits, onBeforeUnmount } from "vue"
import { userStore } from "@/stores/userStore"
import { recordStore } from "@/stores/recordStore"
import Record from "@/interfaces/Record"
const user = userStore()
const records = recordStore()

const record = records.getById(records.toDelete[0]) as Record
const name = record.catno ? record.catno : record.title

const emit = defineEmits<{
  (e: "close"): void
}>()

onBeforeUnmount(() => {
  records.toDelete = []
})

const submit = async () => {
  if (records.toDelete) {
    const response = await records.deleteRecords(user.authd.token)
    if (response === 200) emit("close")
  }
}
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
