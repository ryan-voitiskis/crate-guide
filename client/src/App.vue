<template>
  <div class="container">
    <header>
      <nav class="radio">
        <router-link class="btn" to="/">Session</router-link>
        <router-link class="btn" to="/collection">Collection</router-link>
      </nav>

      <nav class="account">
        <span class="welcome" v-if="user.hasUser()"
          >Welcome {{ user.name != "" ? user.name : user.email }}</span
        >
        <button
          type="button"
          v-if="!user.hasUser()"
          @click="state.signUp = true"
        >
          Create account
        </button>
        <button
          type="button"
          v-if="!user.hasUser()"
          @click="state.login = true"
        >
          Log in
        </button>
        <button type="button" v-if="user.hasUser()" @click="user.$reset()">
          Log out
        </button>
        <button type="button" @click="state.settings = true">
          <CogIcon />
        </button>
      </nav>
    </header>
    <router-view />
  </div>

  <FormModal
    v-if="state.login"
    @close="state.login = false"
    title="Log in"
    modal-width="360px"
  >
    <LoginForm
      @openSignUp=";(state.login = false), (state.signUp = true)"
      @openRecovery=";(state.login = false), (state.recovery = true)"
      @close="state.login = false"
    />
  </FormModal>

  <FormModal
    v-if="state.signUp"
    @close="state.signUp = false"
    title="Sign up"
    modal-width="360px"
  >
    <SignUpForm
      @openLogin=";(state.login = true), (state.signUp = false)"
      @close="state.signUp = false"
    />
  </FormModal>

  <FormModal
    v-if="state.recovery"
    @close="state.recovery = false"
    title="Forgot password?"
    modal-width="360px"
  >
    <RecoveryForm />
  </FormModal>

  <FormModal
    v-if="state.settings"
    @close="state.settings = false"
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

const state = reactive({
  login: false,
  signUp: false,
  recovery: false,
  settings: false,
})
</script>

<style scoped lang="scss">
header {
  display: flex;
}

nav {
  margin: 2rem 0;
  &.radio {
    $border-radius: 1.4rem;
    a {
      background: var(--nav-inactive-bg);
      border: 1px var(--nav-inactive-border) solid;
      border-radius: 0;
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
  button {
    border-radius: 0;
    background: transparent;
    color: var(--dark-text);
    &:hover {
      color: var(--nav-active-bg);
    }
  }
}
.welcome {
  color: var(--welcome-text);
  font: italic 500 1.6rem/3.8rem Manrope, sans-serif;
  padding: 0 2.4rem;
}
</style>
