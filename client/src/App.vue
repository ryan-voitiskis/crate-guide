<template>
  <div class="container">
    <header>
      <nav class="radio">
        <router-link class="btn" to="/">Session</router-link>
        <router-link class="btn" to="/collection">Collection</router-link>
      </nav>

      <nav class="account">
        <span class="welcome" v-if="user.hasUser()"
          >Welcome
          {{ user.authd.name != "" ? user.authd.name : user.authd.email }}</span
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

  <ModalBox v-if="state.login" @close="state.login = false" width="360px">
    <LoginForm
      @openSignUp=";(state.login = false), (state.signUp = true)"
      @openRecovery=";(state.login = false), (state.recovery = true)"
      @close="state.login = false"
    />
  </ModalBox>

  <ModalBox v-if="state.signUp" @close="state.signUp = false" width="360px">
    <SignUpForm
      @openLogin=";(state.login = true), (state.signUp = false)"
      @close="state.signUp = false"
    />
  </ModalBox>

  <ModalBox v-if="state.recovery" @close="state.recovery = false" width="360px">
    <RecoveryForm />
  </ModalBox>

  <ModalBox v-if="state.settings" @close="state.settings = false" width="540px">
    <SettingsForm />
  </ModalBox>

  <ModalBox v-if="user.authDiscogs" @close="user.authDiscogs = false">
    <AuthoriseDiscogs />
  </ModalBox>

  <ModalBox
    v-if="user.revokeDiscogsForm"
    @close="user.revokeDiscogsForm = false"
  >
    <RevokeDiscogsForm />
  </ModalBox>

  <ModalBox
    v-if="user.authd.justCompleteDiscogsOAuth"
    @close="user.authd.justCompleteDiscogsOAuth = false"
  >
    <AuthoriseDiscogsSuccessful />
  </ModalBox>
</template>

<script setup lang="ts">
import { reactive } from "vue"
import CogIcon from "@/components/svg/CogIcon.vue"
import ModalBox from "./components/ModalBox.vue"
import LoginForm from "./components/forms/LoginForm.vue"
import SignUpForm from "./components/forms/SignUpForm.vue"
import RecoveryForm from "./components/forms/RecoveryForm.vue"
import { userStore } from "@/stores/userStore"
import SettingsForm from "./components/forms/SettingsForm.vue"
import AuthoriseDiscogs from "./components/AuthoriseDiscogs.vue"
import AuthoriseDiscogsSuccessful from "./components/AuthoriseDiscogsSuccessful.vue"
import RevokeDiscogsForm from "./components/forms/RevokeDiscogsForm.vue"

const user = userStore()

const state = reactive({
  login: false,
  signUp: false,
  recovery: false,
  settings: false,
})
</script>

<style scoped lang="scss"></style>
