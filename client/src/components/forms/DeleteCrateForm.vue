<template>
  <form @submit.prevent="submit" v-if="crate !== null">
    <span class="form-hint">
      Enter the name &quot;<i>{{ crate.name }}</i
      >&quot; to delete crate.<br />
      <b>This can't be undone.</b>
    </span>
    <div class="form-body inline-labels">
      <BaseInput
        v-model="form.name"
        id="name"
        label="Crate name"
        type="text"
        placeholder="Name"
        :focused="true"
        autocomplete="off"
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
import { reactive, defineEmits } from "vue"
import BaseInput from "./BasicInput.vue"
import ErrorFeedback from "./ErrorFeedback.vue"
import { userStore } from "@/stores/userStore"
import { crateStore } from "@/stores/crateStore"
const user = userStore()
const crates = crateStore()

const crate = crates.getById(user.loggedIn.settings.selectedCrate)

const emit = defineEmits<{
  (e: "close"): void
}>()

const form = reactive({
  name: "",
})

const submit = async () => {
  crates.errorMsg = "" // TODO: this isnt resetting fade in animation
  if (form.name === crate?.name) {
    if (crate._id) {
      const response = await crates.deleteCrate(crate._id, user.loggedIn.token)
      if (response === 200) {
        user.loggedIn.settings.selectedCrate = "all"
        emit("close")
      }
    }
  } else crates.errorMsg = "Name doesn't match"
}
</script>

<style scoped lang="scss">
.form-hint {
  display: block;
}
</style>
