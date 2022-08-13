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
import { reactive, defineEmits, onBeforeMount } from "vue"
import BaseInput from "./BasicInput.vue"
import PasswordInput from "./PasswordInput.vue"
import { userStore } from "@/stores/user"
import User from "@/interfaces/User"

// TODO: set up env or global var for this
const API_URL = "http://localhost:5000/api/users/"

const emit = defineEmits<{
  (e: "openLogin"): void
  (e: "close"): void
}>()

const user = userStore()

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
  fetch(API_URL, options)
    .then((response) => response.json())
    .then((data) => {
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
    })
    .catch((error) => console.log("error", error))
}
</script>

<style scoped lang="scss"></style>
