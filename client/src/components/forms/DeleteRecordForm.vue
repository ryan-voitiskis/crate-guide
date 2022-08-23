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
        :error-msg="state.mismatch ? `Catalog # doesn't match` : undefined"
        :class="{ matched: form.catno === record?.catno }"
        required
      />
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
import { reactive, defineEmits, watch } from "vue"
import BasicInput from "./BasicInput.vue"
import ErrorFeedback from "./ErrorFeedback.vue"
import { userStore } from "@/stores/userStore"
import { recordStore } from "@/stores/recordStore"
const user = userStore()
const records = recordStore()

const record = records.toDelete ? records.getById(records.toDelete) : null

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
  () => {
    state.mismatch = false
  }
)

const submit = async () => {
  if (form.catno === record?.catno) {
    if (records.toDelete) {
      const response = await records.deleteRecord(user.loggedIn.token)
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
