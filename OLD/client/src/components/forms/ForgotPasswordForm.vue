<template>
  <div class="modal-header">
    <h2>Forgot password?</h2>
    <button
      class="close"
      type="button"
      @click="user.forgotPasswordModal = false"
    >
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
      <transition name="fade">
        <div class="success" v-if="user.success">
          <CheckIcon />
          <p>
            If an account exists with that email, you will receive an email with
            instructions.
          </p>
        </div>
      </transition>
      <ErrorFeedback :show="user.errorMsg !== ''" :msg="user.errorMsg" />
      <button class="primary" type="submit" v-if="!user.success">
        {{ user.loading ? null : "Send recovery email" }}
        <LoaderIcon v-show="user.loading" />
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, onUnmounted } from "vue"
import { userStore } from "@/stores/userStore"
import BasicInput from "@/components/inputs/BasicInput.vue"
import XIcon from "@/components/icons/XIcon.vue"
import ErrorFeedback from "../feedbacks/ErrorFeedback.vue"
import CheckIcon from "@/components/icons/CheckIcon.vue"
import LoaderIcon from "../icons/LoaderIcon.vue"
const user = userStore()

const form = reactive({
  email: "",
})

onUnmounted(() => {
  user.errorMsg = ""
  user.success = false
})
</script>

<style scoped lang="scss">
.primary {
  margin-top: 20px;
}

.success {
  width: 100%;
  display: flex;
  justify-content: center;
  margin-bottom: 10px;
  flex-wrap: wrap;
  svg {
    width: 100%;
    height: 44px;
    margin-bottom: 10px;
    color: var(--success);
  }
}

.fade-enter-active {
  animation: fade-in 0.6s linear;
}
</style>
