<template>
  <div class="modal-header">
    <h2>Sign up</h2>
    <button class="close" type="button" @click="$parent!.$emit('close')">
      <XIcon />
    </button>
  </div>
  <form @submit.prevent="submit">
    <div class="modal-body">
      <p @click="openLogin()">
        Already have an account? <span class="link-text">Log in</span>
      </p>
      <div id="privacy-policy">
        <h3>Privacy policy</h3>
        <p>No data, aside from crates is stored. No emails.</p>
      </div>
      <BasicInput
        v-model="form.name"
        id="name"
        label="Name"
        type="text"
        placeholder="Your name"
        :focused="true"
        required
      />
      <BasicInput
        v-model="form.email"
        id="email"
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
        id="password"
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

const submit = async () => {
  const newUser: UnregisteredUser = {
    name: form.name,
    email: form.email,
    password: form.password,
  }
  const response = await user.addUser(newUser)
  if (response === 201) user.signUpModal = false
}

// remove email duplicate warning if email field changes
watch(
  () => form.email,
  () => {
    if (user.errorMsg === "An account with that email already exists.")
      user.errorMsg = ""
  }
)

const openLogin = () => {
  user.loginModal = true
  user.signUpModal = false
}

onUnmounted(() => {
  user.errorMsg = ""
})
</script>

<style scoped lang="scss">
#privacy-policy {
  p,
  h3 {
    color: var(--privacy-policy);
    text-align: left;
  }
  h3 {
    font-weight: 600;
    font-size: 15px;
  }
}
</style>
