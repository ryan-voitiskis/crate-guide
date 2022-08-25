<template>
  <form @submit.prevent="submit">
    <span class="form-hint"
      >Select the crate to add {{ catnos.join(", ") }} to.</span
    >
    <div class="form-body inline-labels">
      <label for="crate_select">Select crate </label>
      <select v-model="form.crate" id="crate_select">
        <option value="">---</option>
        <option
          v-for="crate in crates.crateList"
          :key="crate._id"
          :value="crate._id"
        >
          {{ crate.name }}
        </option>
      </select>
      <ErrorFeedback :show="state.noneSelected" msg="No crate selected" />
      <ErrorFeedback :show="crates.errorMsg !== ''" :msg="crates.errorMsg" />
    </div>
    <div class="form-controls">
      <button class="close" type="button" @click="$parent!.$emit('close')">
        Close
      </button>
      <button class="primary" type="submit" style="width: 16rem">
        {{ crates.loading ? null : "Add to crate" }}
        <LoaderIcon v-show="crates.loading" />
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, defineEmits, watch, onBeforeUnmount } from "vue"
import ErrorFeedback from "./ErrorFeedback.vue"
import LoaderIcon from "@/components/svg/LoaderIcon.vue"
import { userStore } from "@/stores/userStore"
import { crateStore } from "@/stores/crateStore"
import { recordStore } from "@/stores/recordStore"
const user = userStore()
const crates = crateStore()
const records = recordStore()

const emit = defineEmits<{
  (e: "close"): void
}>()

const state = reactive({
  noneSelected: false, // only true after a submit attempt
})

const form = reactive({
  crate: "",
})

const catnos = records.toCrate.map((id) => records.getCatno(id))

// when crate selected, remove "no crate selected" message
watch(
  () => form.crate !== "",
  () => (state.noneSelected = false)
)

// when no crate selected, clear existing error msg for "no crate selected"
watch(
  () => state.noneSelected,
  () => (crates.errorMsg = "")
)

onBeforeUnmount(() => {
  records.toCrate = []
  crates.errorMsg = ""
})

const submit = async () => {
  if (form.crate) {
    if (records.toCrate.length) {
      const response = await crates.pushToCrate(
        records.toCrate as string[],
        form.crate,
        user.authd.token
      )
      if (response === 200 || response === 1) emit("close")
    }
  } else state.noneSelected = true
}
</script>

<style scoped lang="scss">
.form-hint {
  display: block;
}
select {
  margin-bottom: 0;
  width: 100%;
  grid-column: 2 / 3;
}
</style>
