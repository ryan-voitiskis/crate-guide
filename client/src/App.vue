<template>
  <div
    class="container"
    :class="{
      full: $router.currentRoute.value.name === 'session',
      collapsed: session.collapseHeader,
      hidden: state.smallScreen,
    }"
  >
    <transition name="drop">
      <header v-show="!session.collapseHeader">
        <nav
          v-if="$router.currentRoute.value.name !== 'about'"
          class="radio-toggle"
        >
          <router-link class="btn" to="/">Session</router-link>
          <router-link class="btn" to="/collection">Collection</router-link>
        </nav>
        <nav class="account">
          <span class="welcome" v-if="user.authd._id">
            Welcome
            {{ user.authd.name != "" ? user.authd.name : user.authd.email }}
          </span>
          <router-link
            v-if="$router.currentRoute.value.name !== 'about'"
            class="btn about"
            to="/about"
            >About</router-link
          >
          <button
            type="button"
            v-if="!user.authd._id"
            @click="user.signUpModal = true"
          >
            Create account
          </button>
          <button
            type="button"
            v-if="!user.authd._id"
            @click="user.loginModal = true"
          >
            Log in
          </button>
          <button type="button" v-if="user.authd._id" @click="user.logout()">
            Log out
          </button>
          <button type="button" @click="user.settingsModal = true">
            <CogIcon />
          </button>
        </nav>
      </header>
    </transition>
    <router-view v-slot="{ Component }">
      <keep-alive>
        <component :is="Component" :key="$route.fullPath"></component>
      </keep-alive>
    </router-view>
  </div>

  <ModalBox
    v-if="user.loginModal"
    @close="user.loginModal = false"
    width="360px"
  >
    <LoginForm />
  </ModalBox>

  <ModalBox
    v-if="user.signUpModal"
    @close="user.signUpModal = false"
    width="360px"
  >
    <SignUpForm />
  </ModalBox>

  <ModalBox
    v-if="user.forgotPasswordModal"
    @close="user.forgotPasswordModal = false"
    width="360px"
  >
    <ForgotPasswordForm />
  </ModalBox>

  <ModalBox
    v-if="user.resetPasswordModal"
    @close="user.resetPasswordModal = false"
    width="360px"
  >
    <ResetPasswordForm />
  </ModalBox>

  <ModalBox
    v-if="user.changePasswordModal"
    @close="user.changePasswordModal = false"
    width="360px"
  >
    <ChangePasswordForm />
  </ModalBox>

  <ModalBox
    v-if="user.settingsModal"
    @close="user.settingsModal = false"
    width="540px"
  >
    <SettingsForm />
  </ModalBox>

  <ModalBox
    v-if="discogs.authDiscogsModal"
    @close="discogs.authDiscogsModal = false"
  >
    <AuthoriseDiscogs />
  </ModalBox>

  <ModalBox
    v-if="discogs.revokeDiscogsModal"
    @close="discogs.revokeDiscogsModal = false"
  >
    <ConfirmRevokeDiscogs />
  </ModalBox>

  <ModalBox
    v-if="user.authd.justCompleteDiscogsOAuth"
    @close="user.authd.justCompleteDiscogsOAuth = false"
  >
    <AuthoriseDiscogsSuccessful />
  </ModalBox>

  <ModalBox
    v-if="discogs.selectDiscogsFolderModal"
    @close="discogs.selectDiscogsFolderModal = false"
  >
    <SelectDiscogsFolder />
  </ModalBox>

  <ModalBox
    v-if="discogs.stageImportModal"
    @close="discogs.stageImportModal = false"
    width="680px"
  >
    <StageDiscogsImport />
  </ModalBox>

  <ModalBox
    v-if="discogs.importProgressModal"
    @close="discogs.importProgressModal = false"
  >
    <DiscogsImportProgress />
  </ModalBox>

  <ModalBox v-if="discogs.nothingStaged" @close="discogs.nothingStaged = false">
    <UpdateFeedback text="No records were staged for import." />
  </ModalBox>

  <ModalBox v-if="state.queryMsg" @close="state.queryMsg = ''">
    <UpdateFeedback :text="state.queryMsg" />
  </ModalBox>

  <ModalBox
    v-if="spotify.revokeSpotifyModal"
    @close="spotify.revokeSpotifyModal = false"
  >
    <ConfirmRevokeSpotify />
  </ModalBox>

  <ModalBox
    v-if="tracks.toShowFeatures"
    @close="tracks.toShowFeatures = ''"
    width="560px"
  >
    <AudioFeatures />
  </ModalBox>

  <SmallScreenWarning
    v-if="state.smallScreen"
    @close="state.smallScreen = false"
  />
</template>

<script setup lang="ts">
import { reactive, watch } from "vue"
import { discogsStore } from "@/stores/discogsStore"
import { sessionStore } from "@/stores/sessionStore"
import { spotifyStore } from "@/stores/spotifyStore"
import { trackStore } from "@/stores/trackStore"
import { useRoute } from "vue-router"
import { userStore } from "@/stores/userStore"
import AudioFeatures from "@/components/utility/AudioFeatures.vue"
import AuthoriseDiscogs from "@/components/discogs/AuthoriseDiscogs.vue"
import AuthoriseDiscogsSuccessful from "@/components/discogs/AuthoriseDiscogsSuccessful.vue"
import CogIcon from "@/components/icons/CogIcon.vue"
import ConfirmRevokeDiscogs from "@/components/discogs/ConfirmRevokeDiscogs.vue"
import ConfirmRevokeSpotify from "./components/spotify/ConfirmRevokeSpotify.vue"
import DiscogsImportProgress from "@/components/discogs/DiscogsImportProgress.vue"
import LoginForm from "@/components/forms/LoginForm.vue"
import ModalBox from "@/components/utility/ModalBox.vue"
import ForgotPasswordForm from "@/components/forms/ForgotPasswordForm.vue"
import SelectDiscogsFolder from "@/components/discogs/SelectDiscogsFolderForm.vue"
import SettingsForm from "@/components/forms/SettingsForm.vue"
import SignUpForm from "@/components/forms/SignUpForm.vue"
import StageDiscogsImport from "@/components/discogs/StageDiscogsImport.vue"
import UpdateFeedback from "@/components/feedbacks/UpdateFeedback.vue"
import ResetPasswordForm from "./components/forms/ResetPasswordForm.vue"
import ChangePasswordForm from "./components/forms/ChangePasswordForm.vue"
import SmallScreenWarning from "./components/utility/SmallScreenWarning.vue"
const discogs = discogsStore()
const route = useRoute()
const session = sessionStore()
const spotify = spotifyStore()
const tracks = trackStore()
const user = userStore()

const state = reactive({
  queryMsg: route.query.msg?.toString() || "",
  smallScreen: false,
})

if (window.innerWidth < 920) state.smallScreen = true

// get msg from query string, doesn't work with lifecycle hooks :/
watch(
  () => route.query.msg,
  () => {
    state.queryMsg = route.query.msg?.toString() || ""
  }
)

watch(
  () => route.query.reset_token,
  () => {
    if (route.query.reset_token) {
      user.resetPasswordModal = true
      user.resetToken = route.query.reset_token.toString()
    }
  }
)
</script>

<style scoped lang="scss">
header {
  transition: height 0.4s;
  &.collapsed {
    height: 0;
  }
}
.container {
  max-width: 2560px;
  position: relative;
  margin: 0 auto;
  padding: 0 10px;
  transition: height 0.4s;
  &.full {
    height: calc(100% - 78px);
  }
  &.collapsed {
    height: calc(100% - 12px);
  }
  &.hidden {
    display: none;
  }
}

.about:hover {
  background: transparent;
}

.drop-enter-active {
  animation: drop-down-78 0.4s linear;
}

.drop-leave-active {
  animation: drop-up-78 0.4s linear;
}
</style>
