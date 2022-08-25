<template>
  <form @submit.prevent="submit" v-if="record !== null">
    <span class="form-hint">
      Enter the Catalog # &quot;<i>{{ record.catno }}</i
      >&quot; to delete record.<br />
      <b>This can't be undone.</b>
    </span>
    <div class="form-body inline-labels">
      <BasicInput
        v-model="form.catno"
        id="catno"
        label="Catalog #"
        type="text"
        :placeholder="record.catno"
        :focused="true"
        autocomplete="off"
        :class="{ matched: form.catno === record?.catno }"
        required
      />
      <ErrorFeedback :show="state.mismatch" msg="Catalog # doesn't match" />
      <ErrorFeedback :show="records.errorMsg !== ''" :msg="records.errorMsg" />
    </div>
    <div class="form-controls">
      <button class="close" type="button" @click="$parent!.$emit('close')">
        Close
      </button>
      <button class="primary" type="submit" style="width: 12rem">
        {{ records.loading ? null : "Delete" }}
        <LoaderIcon v-show="records.loading" />
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, defineEmits, watch, onBeforeUnmount } from "vue"
import BasicInput from "./BasicInput.vue"
import ErrorFeedback from "./ErrorFeedback.vue"
import { userStore } from "@/stores/userStore"
import { recordStore } from "@/stores/recordStore"
const user = userStore()
const records = recordStore()

console.log(records.toDelete.length)

const record = records.toDelete.length
  ? records.getById(records.toDelete[0])
  : null

const emit = defineEmits<{
  (e: "close"): void
}>()

const form = reactive({
  catno: "",
})

const state = reactive({
  mismatch: false, // only true after a submit attempt
})

// when input text === catno, remove mismatch message
watch(
  () => form.catno === record?.catno,
  () => (state.mismatch = false)
)

// when name mismatch, clear existing error msg for "Catalog # doesn't match"
watch(
  () => state.mismatch,
  () => (records.errorMsg = "")
)

onBeforeUnmount(() => {
  records.toDelete = []
})

const submit = async () => {
  if (form.catno === record?.catno) {
    if (records.toDelete) {
      const response = await records.deleteRecords(user.authd.token)
      if (response === 200) emit("close")
    }
  } else state.mismatch = true
}
</script>

<style scoped lang="scss">
.form-hint {
  display: block;
}
</style>
