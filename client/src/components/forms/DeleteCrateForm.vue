<template>
  <form @submit.prevent="submit">
    <span class="form-hint">
      Enter the name &quot;<i>{{ crate.name }}</i
      >&quot; to delete crate.<br />
      <b>This can't be undone.</b>
    </span>
    <div class="form-body inline-labels">
      <BasicInput
        v-model="form.name"
        id="name"
        label="Crate name"
        type="text"
        :placeholder="crate.name"
        :focused="true"
        autocomplete="off"
        :error-msg="state.mismatch ? `Name doesn't match` : undefined"
        :class="{ matched: form.name === crate?.name }"
        required
      />
      <ErrorFeedback :show="crates.errorMsg !== ''" :msg="crates.errorMsg" />
    </div>
    <div class="form-controls">
      <button class="close" type="button" @click="$parent!.$emit('close')">
        Close
      </button>
      <button class="primary" type="submit" style="width: 12rem">
        {{ crates.loading ? null : "Delete" }}
        <LoaderIcon v-show="crates.loading" />
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, defineEmits, watch } from "vue"
import BasicInput from "./BasicInput.vue"
import ErrorFeedback from "./ErrorFeedback.vue"
import { userStore } from "@/stores/userStore"
import { crateStore } from "@/stores/crateStore"
const user = userStore()
const crates = crateStore()

const crate = crates.getById(user.authd.settings.selectedCrate)

const emit = defineEmits<{
  (e: "close"): void
}>()

const form = reactive({
  name: "",
})

const state = reactive({
  mismatch: false, // only true after a submit attempt
})

// when input text === catno, remove mismatch message
watch(
  () => form.name === crate?.name,
  () => {
    state.mismatch = false
  }
)

const submit = async () => {
  if (form.name === crate?.name) {
    if (crate._id) {
      const response = await crates.deleteCrate(crate._id, user.authd.token)
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
