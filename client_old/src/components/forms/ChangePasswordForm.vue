<template>
  <div class="modal-header">
    <h2>{{ user.success ? "Password changed" : "Change password" }}</h2>
    <button
      class="close"
      type="button"
      @click="user.changePasswordModal = false"
    >
      <XIcon />
    </button>
  </div>
  <form @submit.prevent="submit" v-if="!user.success" class="change=password">
    <div class="modal-body block-labels">
      <p>Enter a new password.</p>
      <BasicInput
        id="current_password"
        v-model="form.currentPassword"
        label="Current password"
        :type="passwordType"
        :focused="true"
        autocomplete="off"
        required
      />
      <BasicInput
        id="new_password"
        v-model="form.password"
        label="New password"
        :type="passwordType"
        autocomplete="off"
        required
        minlength="8"
      />
      <BasicInput
        id="confirm_password"
        v-model="form.passwordConfirm"
        label="Confirm password"
        :type="passwordType"
        autocomplete="off"
        required
      />
      <label class="show-password checkbox">
        <input type="checkbox" v-model="showPassword" /> Show password
      </label>
      <ErrorFeedback
        :show="state.oldIsNew"
        msg="New password must be different from old password"
      />
      <ErrorFeedback :show="state.mismatch" msg="Passwords don't match" />
      <ErrorFeedback :show="user.errorMsg !== ''" :msg="user.errorMsg" />
      <button class="primary" type="submit" v-if="!user.success">
        {{ user.loading ? null : "Change password" }}
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
import { reactive, onUnmounted, ref, computed, watch } from "vue"
import { userStore } from "@/stores/userStore"
import XIcon from "@/components/icons/XIcon.vue"
import ErrorFeedback from "../feedbacks/ErrorFeedback.vue"
import CheckIcon from "@/components/icons/CheckIcon.vue"
import LoaderIcon from "../icons/LoaderIcon.vue"
import BasicInput from "../inputs/BasicInput.vue"
const user = userStore()

const showPassword = ref(false)

const form = reactive({
  currentPassword: "",
  password: "",
  passwordConfirm: "",
})

const state = reactive({
  oldIsNew: false, // only true after a submit attempt
  mismatch: false, // only true after a submit attempt
})

function submit() {
  if (form.currentPassword === form.password) {
    state.oldIsNew = true
    return
  }
  if (form.password !== form.passwordConfirm) state.mismatch = true
  else user.changePassword(form.currentPassword, form.password)
}

const passwordType = computed(() => (showPassword.value ? "text" : "password"))

onUnmounted(() => {
  user.errorMsg = ""
  user.success = false
})

watch(
  () => form.passwordConfirm !== form.password,
  () => (state.mismatch = false)
)

watch(
  () => form.currentPassword !== form.password,
  () => (state.oldIsNew = false)
)
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

<style lang="scss">
#new_password,
#current_password,
#confirm_password {
  border: 1px solid var(--input-border);
}
</style>
