<template>
  <div class="modal-header">
    <h2>{{ user.success ? "Password changed" : "Reset password" }}</h2>
    <button
      class="close"
      type="button"
      @click="user.resetPasswordModal = false"
    >
      <XIcon />
    </button>
  </div>
  <form @submit.prevent="submit" v-if="!user.success">
    <div class="modal-body block-labels">
      <p>Enter a new password.</p>
      <label for="password">New password</label>
      <input
        v-bind="$attrs"
        id="password"
        :type="passwordType"
        v-model="form.password"
      />
      <label for="confirmPassword">Confirm password</label>
      <input
        v-bind="$attrs"
        id="confirmPassword"
        :type="passwordType"
        v-model="form.passwordConfirm"
      />
      <label class="show-password checkbox">
        <input type="checkbox" v-model="showPassword" /> Show password
      </label>
      <ErrorFeedback :show="user.errorMsg !== ''" :msg="user.errorMsg" />
      <button class="primary" type="submit" v-if="!user.success">
        {{ user.loading ? null : "Reset password" }}
        <LoaderIcon v-show="user.loading" />
      </button>
    </div>
  </form>
  <transition name="fade">
    <div class="success modal-body" v-if="user.success">
      <CheckIcon />
      <p>Password successfully reset.</p>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { reactive, onUnmounted, ref, computed } from "vue"
import { userStore } from "@/stores/userStore"
import XIcon from "@/components/icons/XIcon.vue"
import ErrorFeedback from "../feedbacks/ErrorFeedback.vue"
import CheckIcon from "@/components/icons/CheckIcon.vue"
import LoaderIcon from "../icons/LoaderIcon.vue"
const user = userStore()

const showPassword = ref(false)

const form = reactive({
  password: "",
  passwordConfirm: "",
})

function submit() {
  if (form.password !== form.passwordConfirm) {
    user.errorMsg = "Passwords do not match"
    return
  }
  user.resetPassword(form.password)
}

const passwordType = computed(() => (showPassword.value ? "text" : "password"))

onUnmounted(() => {
  user.errorMsg = ""
  user.success = false
})
</script>

<style scoped lang="scss">
.primary {
  margin-top: 20px;
}

.success {
  width: 100%;
  display: flex;
  justify-content: center;
  margin-bottom: 10px;
  flex-wrap: wrap;
  svg {
    width: 100%;
    height: 44px;
    margin-bottom: 10px;
    color: var(--success);
  }
}

.fade-enter-active {
  animation: fade-in 0.6s linear;
}
</style>
