<template>
  <form @submit.prevent="submitLogin">
    <div class="form-body">
      <p @click="$emit('openSignUp')">
        Don't have an account? <span class="link-text">Sign up</span>
      </p>
      <BaseInput
        v-model="user.email"
        id="email"
        label="Email"
        type="email"
        placeholder="name@example.com"
        :focused="true"
      />
      <PasswordInput
        v-model="user.password"
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
import BaseInput from "@/components/forms/BaseInput.vue"
import PasswordInput from "@/components/forms/PasswordInput.vue"

const user = reactive({
  email: "",
  password: "",
})

const submitLogin = () => {
  console.log("login form submitted")
}
</script>

<style scoped lang="scss">
.forgot-password {
  float: right;
  font-size: 1.3rem;
  margin-top: 0.2rem;
}
</style>
