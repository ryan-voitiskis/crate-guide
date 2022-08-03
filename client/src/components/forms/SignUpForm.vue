<template>
  <form @submit.prevent="submitSignUp">
    <div class="form-body">
      <p @click="$emit('openLogin')">
        Already have an account? <span class="link-text">Log in</span>
      </p>
      <BaseInput
        v-model="user.name"
        id="name"
        label="Name"
        type="text"
        placeholder="Your name"
        :focused="true"
      />
      <BaseInput
        v-model="user.email"
        id="email"
        label="Email"
        type="email"
        placeholder="name@example.com"
      />
      <PasswordInput
        v-model="user.password"
        id="password"
        label="Password"
        placeholder="Enter a password"
      />
      <button class="primary" type="submit">Sign up</button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive } from "vue"
import BaseInput from "@/components/forms/BaseInput.vue"
import PasswordInput from "@/components/forms/PasswordInput.vue"

const user = reactive({
  name: "",
  email: "",
  password: "",
})

const submitSignUp = () => {
  console.log("sign up form submitted")
}
</script>

<style scoped lang="scss"></style>
