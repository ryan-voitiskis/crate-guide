<template>
  <div class="container">
    <header>
      <nav v-if="$router.currentRoute.value.name !== 'about'" class="radio">
        <router-link class="btn" to="/">Session</router-link>
        <router-link class="btn" to="/collection">Collection</router-link>
      </nav>
      <nav class="account">
        <span class="welcome" v-if="user.hasUser()"
          >Welcome
          {{ user.authd.name != "" ? user.authd.name : user.authd.email }}</span
        >
        <router-link
          v-if="$router.currentRoute.value.name !== 'about'"
          class="btn"
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
    <router-view />
  </div>

  <ModalBox
    v-if="user.loginModal"
    @close="user.loginModal = false"
    width="360px"
  >
    <LoginForm @close="user.loginModal = false" />
  </ModalBox>

  <ModalBox
    v-if="user.signUpModal"
    @close="user.signUpModal = false"
    width="360px"
  >
    <SignUpForm @close="user.signUpModal = false" />
  </ModalBox>

  <ModalBox
    v-if="user.recoveryModal"
    @close="user.recoveryModal = false"
    width="360px"
  >
    <RecoveryForm />
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
</template>

<script setup lang="ts">
import { reactive, watch } from "vue"
import { useRoute } from "vue-router"
import { discogsStore } from "@/stores/discogsStore"
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
import AudioFeatures from "@/components/collection/AudioFeatures.vue"

const route = useRoute()
const discogs = discogsStore()
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

<style scoped lang="scss"></style>
