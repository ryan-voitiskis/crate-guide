<template>
  <form @submit.prevent="submit">
    <div class="form-body">
      <p @click="$emit('openSignUp')">
        Don't have an account? <span class="link-text">Sign up</span>
      </p>
      <BaseInput
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
      <InvalidFeedback :invalid="user.invalidCreds" msg="Invalid credentials" />
      <button class="primary" type="submit">
        {{ user.loading ? null : "Log in" }}
        <LoaderIcon v-show="user.loading" />
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, defineEmits } from "vue"
import BaseInput from "./BasicInput.vue"
import InvalidFeedback from "./InvalidFeedback.vue"
import PasswordInput from "./PasswordInput.vue"
import { userStore } from "@/stores/userStore"
import { crateStore } from "@/stores/crateStore"
import LoaderIcon from "../svg/LoaderIcon.vue"
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

const state = reactive({
  waiting: false,
  invalidCreds: false,
})

const submit = async () => {
  const response = await user.login(form.email, form.password)
  if (response === 400) {
    console.error(`LoginForm: user.login returned status ${response}`)
  } else if (response === 200) {
    crates.fetchCrates(user.loggedIn.token)
    emit("close")
  }
}
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
