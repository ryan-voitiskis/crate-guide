<template>
  <div class="modal-header">
    <h2>Log in</h2>
    <button class="close" type="button" @click="user.loginModal = false">
      <XIcon />
    </button>
  </div>
  <form @submit.prevent="user.login(form.email, form.password)">
    <div class="modal-body block-labels">
      <p @click=";(user.loginModal = false), (user.signUpModal = true)">
        Don't have an account? <span class="link-text">Sign up</span>
      </p>
      <BasicInput
        id="email"
        v-model="form.email"
        label="Email"
        type="email"
        placeholder="name@example.com"
        :focused="true"
        required
      />
      <PasswordInput
        id="password"
        v-model="form.password"
        label="Password"
        placeholder="Enter your password"
        required
      >
        <span
          @click=";(user.loginModal = false), (user.recoveryModal = true)"
          class="forgot-password"
        >
          Forgot password?
        </span>
      </PasswordInput>
      <ErrorFeedback :show="user.errorMsg != ''" :msg="user.errorMsg" />
      <button class="primary" type="submit">
        {{ user.loading ? null : "Log in" }}
        <LoaderIcon v-show="user.loading" />
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, onUnmounted } from "vue"
import BasicInput from "@/components/inputs/BasicInput.vue"
import ErrorFeedback from "@/components/feedbacks/ErrorFeedback.vue"
import PasswordInput from "@/components/inputs/PasswordInput.vue"
import LoaderIcon from "@/components/icons/LoaderIcon.vue"
import XIcon from "@/components/icons/XIcon.vue"
import { userStore } from "@/stores/userStore"
const user = userStore()

const form = reactive({
  email: "",
  password: "",
})

onUnmounted(() => {
  user.errorMsg = ""
})
</script>

<style scoped lang="scss">
.forgot-password {
  float: right;
  cursor: pointer;
  font-size: 14px;
  color: var(--light-text);
  margin-top: 2px;
  &:hover {
    color: var(--lighter-text);
  }
}
</style>
