<template>
  <form @submit.prevent="submit">
    <InfoDropdown
      text="Crates are collections of records that, when selected, limit session recommendations. A crate could represent a crate of records taken to a gig."
      class="form-body"
      style="margin: -2rem 0 1rem 0"
    />
    <div class="form-body inline-labels">
      <BaseInput
        v-model="form.name"
        id="name"
        label="Name"
        type="text"
        placeholder="Name"
        :focused="true"
        required
      />
      <ErrorFeedback :show="crate.errorMsg !== ''" :msg="crate.errorMsg" />
    </div>
    <div class="form-controls">
      <button type="reset">Clear</button>
      <button class="close" type="button" @click="$parent!.$emit('close')">
        Close
      </button>
      <button class="primary" type="submit">
        {{ crate.loading ? null : "Save" }}
        <LoaderIcon v-show="crate.loading" />
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, defineEmits } from "vue"
import BaseInput from "./BasicInput.vue"
import ErrorFeedback from "./ErrorFeedback.vue"
import InfoDropdown from "../InfoDropdown.vue"
import LoaderIcon from "../svg/LoaderIcon.vue"
import { userStore } from "@/stores/userStore"
import { crateStore } from "@/stores/crateStore"
const user = userStore()
const crate = crateStore()

const emit = defineEmits<{
  (e: "close"): void
}>()

const form = reactive({
  name: "",
})

const submit = async () => {
  const response = await crate.addCrate(
    form.name,
    user.loggedIn.id,
    user.loggedIn.token
  )
  if (response === 400) {
    console.error(`AddCrateForm: crate.addCrate returned status ${response}`)
  } else if (response === 201) emit("close")
}
</script>

<style scoped lang="scss"></style>
