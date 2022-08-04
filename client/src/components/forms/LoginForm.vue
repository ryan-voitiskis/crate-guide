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
      <button class="primary" type="submit">Log in</button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive } from "vue"
import BaseInput from "@/components/forms/BasicInput.vue"
import PasswordInput from "@/components/forms/PasswordInput.vue"
import { userStore } from "@/stores/user"

// todo: set up env or global var for this
const API_URL = "http://localhost:5005/api/users/"

const user = userStore()

const form = reactive({
  email: "",
  password: "",
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
  fetch(API_URL + "login", options)
    .then((response) => response.json())
    .then((data) => {
      user.login(data._id, data.name, data.email, data.token)
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
</style>
