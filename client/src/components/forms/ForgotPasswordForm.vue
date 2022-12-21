<template>
  <div class="modal-header">
    <h2>Forgot password?</h2>
    <button class="close" type="button" @click="user.recoveryModal = false">
      <XIcon />
    </button>
  </div>
  <form @submit.prevent="user.forgotPasword(form.email)">
    <div class="modal-body block-labels">
      <p>Enter your email for reset instructions.</p>
      <BasicInput
        id="email"
        v-model="form.email"
        label="Email"
        type="email"
        placeholder="name@example.com"
      />
      <ErrorFeedback :show="user.errorMsg !== ''" :msg="user.errorMsg" />
      <button class="primary" type="submit">Send recovery email</button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, onUnmounted } from "vue"
import { userStore } from "@/stores/userStore"
import BasicInput from "@/components/inputs/BasicInput.vue"
import XIcon from "@/components/icons/XIcon.vue"
import ErrorFeedback from "../feedbacks/ErrorFeedback.vue"
const user = userStore()

const form = reactive({
  email: "",
})

onUnmounted(() => {
  user.errorMsg = ""
})
</script>

<style scoped lang="scss">
.primary {
  margin-top: 20px;
}
</style>
