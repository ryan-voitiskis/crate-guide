<template>
  <div class="modal-header">
    <h2>Sign up</h2>
    <button class="close" type="button" @click="user.signUpModal = false">
      <XIcon />
    </button>
  </div>
  <form @submit.prevent="submit">
    <div class="modal-body">
      <p @click="openLogin()">
        Already have an account? <span class="link-text">Log in</span>
      </p>
      <BasicInput
        v-model="form.name"
        label="Name"
        type="text"
        placeholder="Your name"
        :focused="true"
        required
      />
      <BasicInput
        v-model="form.email"
        label="Email"
        type="email"
        placeholder="name@example.com"
        :class="{
          invalid:
            user.errorMsg === 'An account with that email already exists.',
        }"
        required
      />
      <PasswordInput
        v-model="form.password"
        label="Password"
        placeholder="Enter a password"
        required
      />
      <ErrorFeedback :show="user.errorMsg !== ''" :msg="user.errorMsg" />
      <button class="primary" type="submit">
        {{ user.loading ? null : "Sign up" }}
        <LoaderIcon v-show="user.loading" />
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, onUnmounted, watch } from "vue"
import BasicInput from "@/components/inputs/BasicInput.vue"
import PasswordInput from "@/components/inputs/PasswordInput.vue"
import ErrorFeedback from "@/components/feedbacks/ErrorFeedback.vue"
import LoaderIcon from "@/components/icons/LoaderIcon.vue"
import XIcon from "@/components/icons/XIcon.vue"
import UnregisteredUser from "@/interfaces/UnregisteredUser"
import { userStore } from "@/stores/userStore"
const user = userStore()

const form = reactive({
  name: "",
  email: "",
  password: "",
})

function submit() {
  const newUser: UnregisteredUser = {
    name: form.name,
    email: form.email,
    password: form.password,
  }
  user.addUser(newUser)
}

function openLogin() {
  user.loginModal = true
  user.signUpModal = false
}

// remove email duplicate warning if email field changes
watch(
  () => form.email,
  () => {
    if (user.errorMsg === "An account with that email already exists.")
      user.errorMsg = ""
  }
)

onUnmounted(() => {
  user.errorMsg = ""
})
</script>

<style scoped lang="scss"></style>
