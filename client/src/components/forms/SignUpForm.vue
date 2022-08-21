<template>
  <form @submit.prevent="submit">
    <div class="form-body">
      <p @click="$emit('openLogin')">
        Already have an account? <span class="link-text">Log in</span>
      </p>
      <div id="privacy-policy">
        <h3>Privacy policy</h3>
        <p>No data, aside from crates is stored. No emails.</p>
      </div>
      <BaseInput
        v-model="form.name"
        id="name"
        label="Name"
        type="text"
        placeholder="Your name"
        :focused="true"
        required
      />
      <BaseInput
        v-model="form.email"
        id="email"
        label="Email"
        type="email"
        placeholder="name@example.com"
        :class="{ invalid: user.duplicateEmail }"
        :error-msg="
          user.duplicateEmail
            ? 'An account with this email already exists.'
            : undefined
        "
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
import { reactive, defineEmits, onUnmounted } from "vue"
import BaseInput from "./BasicInput.vue"
import PasswordInput from "./PasswordInput.vue"
import ErrorFeedback from "./ErrorFeedback.vue"
import LoaderIcon from "@/components/svg/LoaderIcon.vue"
import { userStore } from "@/stores/userStore"
import UnregisteredUser from "@/interfaces/UnregisteredUser"
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

const submit = async () => {
  const newUser: UnregisteredUser = {
    name: form.name,
    email: form.email,
    password: form.password,
  }
  const response = await user.addUser(newUser)
  if (response === 201) emit("close")
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
    font-size: 1.5rem;
  }
}
</style>
