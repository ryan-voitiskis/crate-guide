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

      <SelectInput
        v-model="user.authd.settings.turntablePitchRange"
        id="turntable_pitch"
        label="Select crate"
        :options="turntablePitchOptions"
      />

      <fieldset class="radio">
        <legend>Key format</legend>
        <RadioInput
          v-model="user.authd.settings.keyFormat"
          name="key_format"
          id="key"
          label="Key (G♯ / A♭ Major)"
        />
        <RadioInput
          v-model="user.authd.settings.keyFormat"
          name="key_format"
          id="camelot"
          label="Camelot (4A)"
        />
      </fieldset>

      <fieldset class="controls" v-if="user.hasUser()">
        <legend>Discogs API</legend>
        <div v-if="user.authd.discogsUsername !== ''">
          <span class="username">
            Authorised as Discogs user <i>{{ user.authd.discogsUsername }}</i>
          </span>
        </div>
        <button
          v-if="user.authd.isDiscogsOAuthd"
          @click="discogs.revokeDiscogsForm = true"
        >
          Revoke Discogs access
        </button>
        <DiscogsControls />
      </fieldset>

      <fieldset class="controls" v-if="user.hasUser()">
        <legend>Spotify API</legend>
        <button
          v-if="!user.authd.isSpotifyOAuthd"
          @click="spotify.authorisationRequest()"
        >
          Connect to Spotify
        </button>
        <button v-else @click="spotify.revokeSpotifyForm = true">
          Revoke Spotify acess
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
import RadioInput from "../inputs/RadioInput.vue"
import SelectInput from "../inputs/SelectInput.vue"
const discogs = discogsStore()
const spotify = spotifyStore()
const user = userStore()

// ! breaks when called directly from <form v-on="">. cpu spike + browser non-responsive
const updateSettings = () => user.updateSettings()

const turntablePitchOptions = [
  { id: "8", name: "±8%" },
  { id: "16", name: "±16%" },
  { id: "24", name: "±24%" },
  { id: "50", name: "±50%" },
]

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
  &.controls {
    flex-direction: column;
    button {
      width: 22rem;
    }
  }
}
</style>
