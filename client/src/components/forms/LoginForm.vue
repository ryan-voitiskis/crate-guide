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
      <button class="primary login" type="submit">
        {{ state.loggingIn ? null : "Log in" }}
        <LoaderIcon v-show="state.loggingIn" />
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, defineEmits } from "vue"
import BaseInput from "./BasicInput.vue"
import LoginFeedback from "./LoginFeedback.vue"
import PasswordInput from "./PasswordInput.vue"
import { userStore } from "@/stores/user"
import User from "@/interfaces/User"
import LoaderIcon from "../svg/LoaderIcon.vue"

// TODO: set up env or global var for this
const API_URL = "http://localhost:5000/api/users/"

const emit = defineEmits<{
  (e: "openSignUp"): void
  (e: "openRecovery"): void
  (e: "close"): void
}>()

const user = userStore()

const form = reactive({
  email: "",
  password: "",
})

const state = reactive({
  loggingIn: false,
  invalidCreds: false,
})

const submitLogin = () => {
  const urlencoded = new URLSearchParams()
  urlencoded.append("email", form.email)
  urlencoded.append("password", form.password)

  const options = {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: urlencoded,
  }
  /*
    invalidCreds set false so enter-active transition occurs on consecutive login fail
    invalidCredsWrapper exists to stop resize of LoginForm when invalidCreds toggles off and on
    see LoginFeedback.vue
   */
  state.invalidCreds = false
  state.loggingIn = true
  fetch(API_URL + "login", options)
    .then((response) => response.json())
    .then((data) => {
      if (data._id !== undefined) {
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
      } else {
        state.invalidCreds = true
        state.loggingIn = false
      }
    })
    .catch((error) => console.log("error", error))
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
.login {
  svg {
    fill: #fff;
  }
}
</style>
