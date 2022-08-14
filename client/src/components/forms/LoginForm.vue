<template>
  <form @submit.prevent="submitLogin">
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
      >
        <span @click="$emit('openRecovery')" class="forgot-password">
          Forgot password?
        </span>
      </PasswordInput>
      <LoginFeedback :invalidCreds="state.invalidCreds" />
      <button class="primary" type="submit">
        {{ state.waiting ? null : "Log in" }}
        <LoaderIcon v-show="state.waiting" />
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, defineEmits, inject } from "vue"
import BaseInput from "./BasicInput.vue"
import LoginFeedback from "./LoginFeedback.vue"
import PasswordInput from "./PasswordInput.vue"
import { userStore } from "@/stores/user"
import User from "@/interfaces/User"
import LoaderIcon from "../svg/LoaderIcon.vue"
const API_URL = inject("API_URL")
const user = userStore()

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

const submitLogin = async () => {
  state.invalidCreds = false
  state.waiting = true

  const body = new URLSearchParams()
  body.append("email", form.email)
  body.append("password", form.password)

  const options = {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body,
  }

  try {
    const response = await fetch(API_URL + "users/login", options)
    if (response.status === 200) {
      const data = await response.json()
      const loggingInUser: User = {
        id: data._id,
        name: data.name,
        email: data.email,
        token: data.token,
        settings: {
          theme: data.settings.theme,
          turntableTheme: data.settings.turntableTheme,
          turntablePitchRange: data.settings.turntablePitchRange,
        },
      }
      user.login(loggingInUser)
      emit("close")

      // handle invalid credentials
    } else if (response.status === 400) {
      state.invalidCreds = true
      state.waiting = false
    }
  } catch (error) {
    console.error(error)
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
