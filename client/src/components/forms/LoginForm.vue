<template>
  <div class="modal-header">
    <h2>Log in</h2>
    <button class="close" type="button" @click="$parent!.$emit('close')">
      <XIcon />
    </button>
  </div>
  <form @submit.prevent="submit">
    <div class="modal-body">
      <p @click="$emit('openSignUp')">
        Don't have an account? <span class="link-text">Sign up</span>
      </p>
      <BasicInput
        v-model="form.email"
        id="email"
        label="Email"
        type="email"
        placeholder="name@example.com"
        :focused="true"
        required
      />
      <PasswordInput
        v-model="form.password"
        id="password"
        label="Password"
        placeholder="Enter your password"
        required
      >
        <span @click="$emit('openRecovery')" class="forgot-password">
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
import { reactive, defineEmits, onUnmounted } from "vue"
import BasicInput from "./inputs/BasicInput.vue"
import ErrorFeedback from "./feedbacks/ErrorFeedback.vue"
import PasswordInput from "./inputs/PasswordInput.vue"
import LoaderIcon from "@/components/svg/LoaderIcon.vue"
import XIcon from "@/components/svg/XIcon.vue"
import { userStore } from "@/stores/userStore"
import { crateStore } from "@/stores/crateStore"
const user = userStore()
const crates = crateStore()

const emit = defineEmits<{
  (e: "openSignUp"): void
  (e: "openRecovery"): void
  (e: "close"): void
}>()

const form = reactive({
  email: "",
  password: "",
})

const submit = async () => {
  const response = await user.login(form.email, form.password)
  if (response === 200) {
    crates.fetchCrates(user.authd.token)
    emit("close")
  }
}

onUnmounted(() => {
  user.errorMsg = ""
})
</script>

<style scoped lang="scss">
.forgot-password {
  float: right;
  cursor: pointer;
  font-size: 1.4rem;
  color: var(--light-text);
  margin-top: 0.2rem;
}
</style>
