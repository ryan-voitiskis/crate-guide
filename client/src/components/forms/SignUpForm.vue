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
      />
      <PasswordInput
        v-model="form.password"
        id="password"
        label="Password"
        placeholder="Enter a password"
      />
      <button class="primary" type="submit">Sign up</button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, defineEmits, inject } from "vue"
import BaseInput from "./BasicInput.vue"
import PasswordInput from "./PasswordInput.vue"
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

const submitSignUp = () => {
  const urlencoded = new URLSearchParams()
  urlencoded.append("name", form.name)
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
  fetch(API_URL + "users/", options)
    .then((response) => response.json())
    .then((data) => {
      if (!data.message) {
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
      } else {
        // TODO: replace this with login form style notification
        alert(data.message)
      }
    })
    .catch((error) => console.log("error", error))
}
</script>

<style scoped lang="scss"></style>
