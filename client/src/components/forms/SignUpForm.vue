<template>
  <form @submit.prevent="submitSignUp">
    <div class="form-body">
      <p @click="$emit('openLogin')">
        Already have an account? <span class="link-text">Log in</span>
      </p>
      <BaseInput
        v-model="form.name"
        id="name"
        label="Name"
        type="text"
        placeholder="Your name"
        :focused="true"
      />
      <BaseInput
        v-model="form.email"
        id="email"
        label="Email"
        type="email"
        placeholder="name@example.com"
        :class="{ invalid: state.duplicateEmail }"
        :error-msg="state.emailErrorMsg"
      />
      <PasswordInput
        v-model="form.password"
        id="password"
        label="Password"
        placeholder="Enter a password"
      />
      <button class="primary" type="submit">
        {{ state.waiting ? null : "Sign up" }}
        <LoaderIcon v-show="state.waiting" />
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, defineEmits, inject } from "vue"
import BaseInput from "./BasicInput.vue"
import PasswordInput from "./PasswordInput.vue"
import LoaderIcon from "../svg/LoaderIcon.vue"
import { userStore } from "@/stores/user"
import User from "@/interfaces/User"
const API_URL = inject("API_URL")
const user = userStore()

const emit = defineEmits<{
  (e: "openLogin"): void
  (e: "close"): void
}>()

const form = reactive({
  name: "",
  email: "",
  password: "",
})

const state = reactive({
  duplicateEmail: false,
  emailErrorMsg: "",
  waiting: false,
})

const submitSignUp = async () => {
  state.duplicateEmail = false
  state.emailErrorMsg = ""
  state.waiting = true

  const body = new URLSearchParams()
  body.append("name", form.name)
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
    const response = await fetch(API_URL + "users/", options)
    if (response.status === 201) {
      const data = await response.json()
      const registeringUser: User = {
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
      user.login(registeringUser)
      emit("close")

      // handle duplicate email
    } else if (response.status === 409) {
      const data = await response.json()
      state.duplicateEmail = true
      state.emailErrorMsg = data.message
      state.waiting = false
    }
  } catch (error) {
    console.error(error)
  }
}
</script>

<style scoped lang="scss"></style>
