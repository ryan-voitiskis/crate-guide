<template>
  <form @submit.prevent="submit">
    <p class="form-hint">Enter the new name of the duplicated crate.</p>
    <div class="modal-body inline-labels">
      <BasicInput
        v-model="form.name"
        id="name"
        label="Crate name"
        type="text"
        placeholder="Name"
        :focused="true"
        required
      />
      <ErrorFeedback :show="crates.errorMsg !== ''" :msg="crates.errorMsg" />
    </div>
    <div class="modal-controls">
      <button type="reset">Clear</button>
      <button class="close" type="button" @click="$parent!.$emit('close')">
        Close
      </button>
      <button class="primary" type="submit" style="width: 12rem">
        {{ crates.loading ? null : "Save" }}
        <LoaderIcon v-show="crates.loading" />
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, defineEmits, onBeforeUnmount } from "vue"
import BasicInput from "./inputs/BasicInput.vue"
import ErrorFeedback from "./feedbacks/ErrorFeedback.vue"
import LoaderIcon from "@/components/svg/LoaderIcon.vue"
import UnsavedCrate from "@/interfaces/UnsavedCrate"
import { userStore } from "@/stores/userStore"
import { crateStore } from "@/stores/crateStore"
const user = userStore()
const crates = crateStore()

const emit = defineEmits<{
  (e: "close"): void
}>()

const form = reactive({
  name: "",
})

const submit = async () => {
  const records = crates.getById(user.authd.settings.selectedCrate)
    ?.records as string[]
  const unsavedCrate: UnsavedCrate = {
    user: user.authd._id,
    name: form.name,
    records: records,
  }
  const response = await crates.addCrate(unsavedCrate, user.authd.token)
  if (response === 400) {
    console.error(`AddCrateForm: crate.addCrate returned status ${response}`)
  } else if (response === 201) emit("close")
}

onBeforeUnmount(() => {
  crates.errorMsg = ""
})
</script>

<style scoped lang="scss"></style>
