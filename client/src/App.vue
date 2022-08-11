<template>
  <div class="container">
    <header>
      <nav class="radio">
        <router-link class="btn" to="/">Session</router-link>
        <router-link class="btn" to="/collection">Collection</router-link>
      </nav>

      <nav class="account">
        <span class="welcome" v-if="user.name != ''"
          >Welcome {{ user.name }}</span
        >
        <button type="button" v-if="user.id == 0" @click="openSignUp">
          Create account
        </button>
        <button type="button" v-if="user.id == 0" @click="openLogin">
          Log in
        </button>
        <button type="button" v-if="user.id != 0" @click="user.logout">
          Log out
        </button>
        <button type="button" @click="openSettings">
          <CogIcon />
        </button>
      </nav>
    </header>
    <router-view />
  </div>

  <FormModal
    v-if="modalState.login"
    @close="modalState.login = false"
    title="Log in"
    modal-width="360px"
  >
    <!-- closeModals not targeting single modal. see https://github.com/ryan-voitiskis/vinylbox/issues/2  -->
    <LoginForm
      @openSignUp="openSignUp"
      @openRecovery="openRecovery"
      @closeModal="closeModals"
    />
  </FormModal>

  <FormModal
    v-if="modalState.signUp"
    @close="modalState.signUp = false"
    title="Sign up"
    modal-width="360px"
  >
    <!-- closeModals not targeting single modal. see https://github.com/ryan-voitiskis/vinylbox/issues/2  -->
    <SignUpForm @openLogin="openLogin" @closeModal="closeModals" />
  </FormModal>

  <FormModal
    v-if="modalState.recovery"
    @close="modalState.recovery = false"
    title="Forgot password?"
    modal-width="360px"
  >
    <RecoveryForm @openLogin="openLogin" />
  </FormModal>

  <FormModal
    v-if="modalState.settings"
    @close="modalState.settings = false"
    title="Settings"
    modal-width="540px"
  >
    <SettingsForm />
  </FormModal>
</template>

<script setup lang="ts">
import { reactive } from "vue"
import CogIcon from "@/components/svg/CogIcon.vue"
import FormModal from "./components/forms/FormModal.vue"
import LoginForm from "./components/forms/LoginForm.vue"
import SignUpForm from "./components/forms/SignUpForm.vue"
import RecoveryForm from "./components/forms/RecoveryForm.vue"
import { userStore } from "@/stores/user"
import SettingsForm from "./components/forms/SettingsForm.vue"

const user = userStore()

const modalState = reactive({
  login: false,
  signUp: false,
  recovery: false,
  settings: false,
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

const openSettings = () => {
  closeModals()
  modalState.settings = true
}
</script>

<style lang="scss">
header {
  display: flex;
  nav {
    margin: 2rem 0;
    &.radio {
      $border-radius: 1.4rem;
      a {
        background: var(--nav-inactive-bg);
        border: 1px var(--nav-inactive-border) solid;
        border-radius: none;
        color: var(--nav-inactive-text);
        font-weight: 500;
        z-index: 50;
        &:first-child {
          border-radius: $border-radius 0 0 $border-radius;
          border-right: none;
          margin-right: calc($border-radius * -0.5);
          padding: 0 calc($border-radius * 2) 0 $border-radius;
        }
        &:last-child {
          border-left: none;
          border-radius: 0 $border-radius $border-radius 0;
          margin-left: calc($border-radius * -0.5);
          padding: 0 $border-radius 0 calc($border-radius * 2);
        }
        &.router-link-exact-active {
          background: var(--nav-active-bg);
          border-color: var(--nav-active-bg);
          border-radius: $border-radius;
          color: var(--white-text);
          z-index: 51;
          svg path {
            fill: var(--nav-active-bg);
          }
          &:first-child,
          &:last-child {
            padding: 0 $border-radius;
          }
        }
      }
    }
  }
  nav.account {
    margin-left: auto;
    button:hover {
      color: var(--nav-active-bg);
    }
    .welcome {
      color: var(--welcome-text);
      font: italic 500 1.6rem/3.8rem Manrope, sans-serif;
      padding: 0 2.4rem;
    }
  }
}
</style>
