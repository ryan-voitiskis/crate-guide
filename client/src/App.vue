<template>
  <div class="container">
    <nav>
      <button class="login" type="button" @click="openLogin">Log in</button>
      <button class="login" type="button" @click="openSignUp">
        Register an account
      </button>
      <router-link class="btn" to="/">Session</router-link>
      <router-link class="btn" to="/collection">Collection</router-link>
      <router-link class="btn" to="/settings"><CogIcon /></router-link>
    </nav>
    <router-view />
  </div>

  <FormModal
    v-if="modalState.login"
    @close="modalState.login = false"
    title="Log in"
    modal-width="360px"
  >
    <LoginForm @openSignUp="openSignUp" @openRecovery="openRecovery" />
  </FormModal>
  <FormModal
    v-if="modalState.signUp"
    @close="modalState.signUp = false"
    title="Sign up"
    modal-width="360px"
  >
    <SignUpForm @openLogin="openLogin" />
  </FormModal>
  <FormModal
    v-if="modalState.recovery"
    @close="modalState.recovery = false"
    title="Forgot password?"
    modal-width="360px"
  >
    <RecoveryForm @openLogin="openLogin" />
  </FormModal>
</template>

<script setup lang="ts">
import { reactive } from "vue"
import CogIcon from "@/components/svg/CogIcon.vue"
import FormModal from "./components/forms/FormModal.vue"
import LoginForm from "./components/forms/LoginForm.vue"
import SignUpForm from "./components/forms/SignUpForm.vue"
import RecoveryForm from "./components/forms/RecoveryForm.vue"

const modalState = reactive({
  login: false,
  signUp: false,
  recovery: false,
})

const closeModals = () => {
  modalState.login = false
  modalState.signUp = false
  modalState.recovery = false
}

const openSignUp = () => {
  closeModals()
  modalState.signUp = true
}

const openLogin = () => {
  closeModals()
  modalState.login = true
}

const openRecovery = () => {
  closeModals()
  modalState.recovery = true
}
</script>

<style lang="scss">
nav {
  padding: 30px;
  a {
    &.router-link-exact-active {
      color: #bb7e45;
      svg path {
        fill: #bb7e45;
      }
    }
  }
}
</style>
