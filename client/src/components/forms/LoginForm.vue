<template>
  <div class="modal-header">
    <h2>Log in</h2>
    <button class="close" type="button" @click="user.loginModal = false">
      <XIcon />
    </button>
  </div>
  <form @submit.prevent="submit">
    <div class="modal-body">
      <p @click="openSignUp()">
        Don't have an account? <span class="link-text">Sign up</span>
      </p>
      <BasicInput
        v-model="form.email"
        label="Email"
        type="email"
        placeholder="name@example.com"
        :focused="true"
        required
      />
      <PasswordInput
        v-model="form.password"
        label="Password"
        placeholder="Enter your password"
        required
      >
        <span @click="openRecovery()" class="forgot-password">
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
import { crateStore } from "@/stores/crateStore"
import { recordStore } from "@/stores/recordStore"
const user = userStore()
const crates = crateStore()
const records = recordStore()

const form = reactive({
  email: "",
  password: "",
})

const submit = async () => {
  const response = await user.login(form.email, form.password)
  if (response === 200) {
    user.loginModal = false
    crates.fetchCrates()
    records.fetchRecords()
  }
}

const openSignUp = () => {
  user.loginModal = false
  user.signUpModal = true
}

const openRecovery = () => {
  user.loginModal = false
  user.recoveryModal = true
}

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
}
</style>
