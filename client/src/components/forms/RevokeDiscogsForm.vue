<template>
  <div class="modal-header">
    <h2>Revoke discogs access</h2>
    <button class="close" type="button" @click="$parent!.$emit('close')">
      <XIcon />
    </button>
  </div>
  <form @submit.prevent="submit">
    <span class="form-question">
      Are you sure you wish to revoke {{ appNamePossessive }} access to your
      discogs collections?
    </span>
    <span class="form-question">
      You can easily request access again later.
    </span>
    <div class="modal-body centered-btns">
      <button class="close" type="button" @click="$parent!.$emit('close')">
        Cancel
      </button>
      <button
        class="primary delete"
        type="submit"
        style="width: 12rem"
        @click="user.revokeDiscogsToken()"
      >
        {{ user.loading ? null : "Revoke" }}
        <LoaderIcon v-show="user.loading" />
      </button>
    </div>
    <div class="modal-body">
      <ErrorFeedback
        :show="user.errorMsg !== ''"
        :msg="user.errorMsg"
        :notReserved="true"
      />
    </div>
  </form>
</template>

<script setup lang="ts">
import { onBeforeUnmount, inject } from "vue"
import ErrorFeedback from "@/components/forms/feedbacks/ErrorFeedback.vue"
import XIcon from "@/components/svg/XIcon.vue"
import LoaderIcon from "@/components/svg/LoaderIcon.vue"
import { userStore } from "@/stores/userStore"
const user = userStore()
const appNamePossessive = inject("appNamePossessive")

onBeforeUnmount(() => {
  user.revokeDiscogsForm = false
})
</script>

<style scoped lang="scss"></style>
