<template>
  <div class="modal-header">
    <h2>Forgot password?</h2>
    <button class="close" type="button" @click="$parent!.$emit('close')">
      <XIcon />
    </button>
  </div>
  <form @submit.prevent="submitRecovery">
    <div class="modal-body">
      <p>Enter your email for reset instructions.</p>
      <BasicInput
        v-model="user.email"
        id="email"
        label="Email"
        type="email"
        placeholder="name@example.com"
      />
      <button class="primary" type="submit">Send recovery email</button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive } from "vue"
import BasicInput from "@/components/inputs/BasicInput.vue"
import XIcon from "@/components/icons/XIcon.vue"

const user = reactive({
  email: "",
})

const submitRecovery = () => {
  console.log("password recovery form submitted")
}
</script>

<style scoped lang="scss"></style>
