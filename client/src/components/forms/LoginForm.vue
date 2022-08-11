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
        <span @click="$emit('openRecovery')" class="link-text forgot-password">
          Forgot password?
        </span>
      </PasswordInput>
      <div class="invalid-creds-wrapper" v-show="form.invalidCredsWrapper">
        <transition name="wobble">
          <span class="invalid-creds" v-if="form.invalidCreds">
            <ExclamationIcon /> Invalid credentials
          </span>
        </transition>
      </div>
      <button class="primary" type="submit">Log in</button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, defineEmits } from "vue"
import BaseInput from "@/components/forms/BasicInput.vue"
import PasswordInput from "@/components/forms/PasswordInput.vue"
import { userStore } from "@/stores/user"
import ExclamationIcon from "../svg/ExclamationIcon.vue"

// TODO: set up env or global var for this
const API_URL = "http://localhost:5000/api/users/"

const emit = defineEmits<{
  (e: "openSignUp"): void
  (e: "openRecovery"): void
  (e: "closeModal"): void
}>()

const user = userStore()

const form = reactive({
  email: "",
  password: "",
  invalidCreds: false,
  invalidCredsWrapper: false,
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
   */
  form.invalidCreds = false
  fetch(API_URL + "login", options)
    .then((response) => response.json())
    .then((data) => {
      if (data._id !== undefined) {
        user.login(
          data._id,
          data.name,
          data.email,
          data.token,
          data.settings.theme,
          data.settings.turntableTheme,
          data.settings.turntablePitchRange
        )
        emit("closeModal")
      } else {
        form.invalidCredsWrapper = true
        form.invalidCreds = true
      }
    })
    .catch((error) => console.log("error", error))
}
</script>

<style scoped lang="scss">
.forgot-password {
  float: right;
  font-size: 1.3rem;
  margin-top: 0.2rem;
}

.invalid-creds-wrapper {
  height: 3.8rem;
  .invalid-creds {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--error-text);
    font: 600 1.6rem/3.8rem Manrope, sans-serif;
    background: var(--error-bg);
    border-radius: 1rem;
    svg {
      height: 2rem;
      margin-right: 1rem;
    }
  }
}

.wobble-enter-active {
  animation: wobble 1s ease;
}
</style>
