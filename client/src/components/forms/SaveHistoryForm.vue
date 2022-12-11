<template>
  <div class="modal-header">
    <h2>Save set</h2>
    <button
      class="close"
      type="button"
      @click="session.saveHistoryForm = false"
    >
      <XIcon />
    </button>
  </div>
  <form @submit.prevent="submit">
    <div class="modal-body inline-labels">
      <BasicInput
        v-model="form.name"
        label="Name"
        type="text"
        :placeholder="namePlaceholder"
        :focused="true"
        autocomplete="off"
        maxlength="40"
        required
      />
      <ErrorFeedback :show="session.errorMsg !== ''" :msg="session.errorMsg" />
    </div>
    <div class="modal-footer">
      <button type="reset">Clear</button>
      <button
        class="close"
        type="button"
        @click="session.saveHistoryForm = false"
      >
        Close
      </button>
      <button class="primary" type="submit">
        {{ session.loading ? null : "Save" }}
        <LoaderIcon v-show="session.loading" />
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, onBeforeUnmount } from "vue"
import BasicInput from "@/components/inputs/BasicInput.vue"
import ErrorFeedback from "@/components/feedbacks/ErrorFeedback.vue"
import LoaderIcon from "@/components/icons/LoaderIcon.vue"
import XIcon from "@/components/icons/XIcon.vue"
import UnsavedSet from "@/interfaces/UnsavedSet"
import { sessionStore } from "@/stores/sessionStore"
const session = sessionStore()

const namePlaceholder = `eg. "Set from a gig"`

const form = reactive({
  name: "",
})

function submit() {
  const unsavedSet: UnsavedSet = {
    name: form.name.trim(),
    set: session.set,
  }
  session.saveSet(unsavedSet)
}

onBeforeUnmount(() => {
  session.errorMsg = ""
})
</script>

<style scoped lang="scss"></style>
