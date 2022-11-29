<template>
  <div class="container">
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
          <span class="welcome" v-if="user.hasUser()">
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
            v-if="!user.hasUser()"
            @click="user.signUpModal = true"
          >
            Create account
          </button>
          <button
            type="button"
            v-if="!user.hasUser()"
            @click="user.loginModal = true"
          >
            Log in
          </button>
          <button type="button" v-if="user.hasUser()" @click="user.$reset()">
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

  <ModalBox v-if="user.loginModal" width="360px">
    <LoginForm />
  </ModalBox>

  <ModalBox v-if="user.signUpModal" width="360px">
    <SignUpForm />
  </ModalBox>

  <ModalBox v-if="user.recoveryModal" width="360px">
    <RecoveryForm />
  </ModalBox>

  <ModalBox v-if="user.settingsModal" width="540px">
    <SettingsForm />
  </ModalBox>

  <ModalBox v-if="discogs.authDiscogsModal">
    <AuthoriseDiscogs />
  </ModalBox>

  <ModalBox v-if="discogs.revokeDiscogsModal">
    <ConfirmRevokeDiscogs />
  </ModalBox>

  <ModalBox v-if="user.authd.justCompleteDiscogsOAuth">
    <AuthoriseDiscogsSuccessful />
  </ModalBox>

  <ModalBox v-if="discogs.selectDiscogsFolderModal">
    <SelectDiscogsFolder />
  </ModalBox>

  <ModalBox v-if="discogs.stageImportModal" width="680px">
    <StageDiscogsImport />
  </ModalBox>

  <ModalBox v-if="discogs.importProgressModal">
    <DiscogsImportProgress />
  </ModalBox>

  <ModalBox v-if="discogs.nothingStaged" @close="discogs.nothingStaged = false">
    <UpdateFeedback text="No records were staged for import." />
  </ModalBox>

  <ModalBox v-if="state.queryMsg" @close="state.queryMsg = ''">
    <UpdateFeedback :text="state.queryMsg" />
  </ModalBox>

  <ModalBox v-if="spotify.revokeSpotifyModal">
    <ConfirmRevokeSpotify />
  </ModalBox>

  <ModalBox v-if="tracks.toShowFeatures" width="560px">
    <AudioFeatures />
  </ModalBox>
</template>

<script setup lang="ts">
import { reactive, watch } from "vue"
import { useRoute } from "vue-router"
import { discogsStore } from "@/stores/discogsStore"
import { sessionStore } from "@/stores/sessionStore"
import { spotifyStore } from "@/stores/spotifyStore"
import { trackStore } from "@/stores/trackStore"
import { userStore } from "@/stores/userStore"
import AuthoriseDiscogs from "@/components/discogs/AuthoriseDiscogs.vue"
import AuthoriseDiscogsSuccessful from "@/components/discogs/AuthoriseDiscogsSuccessful.vue"
import CogIcon from "@/components/icons/CogIcon.vue"
import DiscogsImportProgress from "@/components/discogs/DiscogsImportProgress.vue"
import LoginForm from "@/components/forms/LoginForm.vue"
import ModalBox from "@/components/utility/ModalBox.vue"
import RecoveryForm from "@/components/forms/RecoveryForm.vue"
import ConfirmRevokeDiscogs from "@/components/discogs/ConfirmRevokeDiscogs.vue"
import SelectDiscogsFolder from "@/components/discogs/SelectDiscogsFolderForm.vue"
import SettingsForm from "@/components/forms/SettingsForm.vue"
import SignUpForm from "@/components/forms/SignUpForm.vue"
import StageDiscogsImport from "@/components/discogs/StageDiscogsImport.vue"
import UpdateFeedback from "@/components/feedbacks/UpdateFeedback.vue"
import ConfirmRevokeSpotify from "./components/spotify/ConfirmRevokeSpotify.vue"
import AudioFeatures from "@/components/utility/AudioFeatures.vue"

const discogs = discogsStore()
const route = useRoute()
const session = sessionStore()
const spotify = spotifyStore()
const tracks = trackStore()
const user = userStore()

const state = reactive({
  queryMsg: route.query.msg?.toString() || "",
})

// get msg from query string, doesn't work with lifecycle hooks :/
watch(
  () => route.query.msg,
  () => {
    state.queryMsg = route.query.msg?.toString() || ""
  }
)
</script>

<style scoped lang="scss">
header {
  transition: height 0.4s;
}
header.collapsed {
  height: 0;
}
.container {
  max-width: 1846px;
  position: relative;
  margin: 0 auto;
  padding: 0 10px;
  overflow-y: scroll;
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
