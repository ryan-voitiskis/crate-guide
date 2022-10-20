<template>
  <div class="modal-header">
    <h2>Settings</h2>
    <button class="close" type="button" @click="$parent!.$emit('close')">
      <XIcon />
    </button>
  </div>
  <form v-on="user.hasUser() ? { change: updateSettings } : {}" @submit.prevent>
    <div class="modal-body">
      <p v-if="!user.hasUser()">
        <b>You are not logged in.</b><br />Settings changed here are for this
        session only.
      </p>
      <fieldset>
        <legend>Theme</legend>
        <RadioCard
          v-model="user.authd.settings.theme"
          name="theme"
          id="light"
          label="Light"
        />
        <RadioCard
          v-model="user.authd.settings.theme"
          name="theme"
          id="dark"
          label="Dark"
        />
        <RadioCard
          v-model="user.authd.settings.theme"
          name="theme"
          id="contrast"
          label="High contrast"
        />
      </fieldset>

      <fieldset>
        <legend>Turntable colour</legend>
        <RadioCard
          v-model="user.authd.settings.turntableTheme"
          name="turntable_colour"
          id="silver"
          label="Silver"
        />
        <RadioCard
          v-model="user.authd.settings.turntableTheme"
          name="turntable_colour"
          id="black"
          label="Black"
        />
      </fieldset>

      <label for="turntable_pitch"
        >Turntable pitch range
        <select
          v-model="user.authd.settings.turntablePitchRange"
          id="turntable_pitch"
        >
          <option value="8">±8%</option>
          <option value="16">±16%</option>
          <option value="24">±24%</option>
          <option value="50">±50%</option>
        </select>
      </label>

      <fieldset class="discogs-ctrls" v-if="user.hasUser()">
        <legend>Discogs API</legend>
        <div v-if="user.authd.discogsUsername !== ''">
          <span class="username">
            Authorised as discogs user <i>{{ user.authd.discogsUsername }}</i>
          </span>
        </div>
        <button
          v-if="user.authd.isDiscogsOAuthd"
          @click="discogs.revokeDiscogsForm = true"
        >
          Revoke discogs access
        </button>
        <DiscogsControls />
      </fieldset>

      <fieldset class="discogs-ctrls" v-if="user.hasUser()">
        <legend>Spotify API</legend>
        <button @click="spotify.authorisationRequest()">
          Connect to Spotify
        </button>
      </fieldset>

      <SubmitlessFeedback />
    </div>
  </form>
</template>

<script setup lang="ts">
import { onBeforeMount, onUnmounted } from "vue"
import RadioCard from "@/components/inputs/RadioCard.vue"
import SubmitlessFeedback from "@/components/feedbacks/SubmitlessFeedback.vue"
import XIcon from "@/components/icons/XIcon.vue"
import { discogsStore } from "@/stores/discogsStore"
import { spotifyStore } from "@/stores/spotifyStore"
import { userStore } from "@/stores/userStore"
import DiscogsControls from "../discogs/DiscogsControls.vue"
const discogs = discogsStore()
const spotify = spotifyStore()
const user = userStore()

// ! breaks when called directly from <form v-on="">. cpu spike + browser non-responsive
const updateSettings = () => user.updateSettings()

// required for when settings changed elsewhere, such as selected crate
onBeforeMount(() => {
  user.loading = false
  user.success = false
})

onUnmounted(() => {
  user.loading = false
  user.success = false
})
</script>

<style scoped lang="scss">
fieldset {
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
  &.discogs-ctrls {
    flex-direction: column;
    button {
      width: 22rem;
    }
  }
}
</style>
