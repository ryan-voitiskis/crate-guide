<template>
  <div class="modal-header">
    <h2>Settings</h2>
    <button class="close" type="button" @click="user.settingsModal = false">
      <XIcon />
    </button>
  </div>
  <form @change="updateSettings" @submit.prevent>
    <div class="modal-body">
      <p v-if="!user.authd._id">
        <b>You are not logged in.</b><br />Settings changed here are for this
        session only.
      </p>
      <fieldset>
        <legend>Theme</legend>
        <RadioTheme
          v-model="user.authd.settings.theme"
          name="theme"
          id="auto"
          label="Automatic"
          :themeBackground="autoThemeOptionScheme.themeBackground"
          :themePrimary="autoThemeOptionScheme.themePrimary"
          :themeSecondary="autoThemeOptionScheme.themeSecondary"
          :themeDarkText="autoThemeOptionScheme.themeDarkText"
          :themeRecord="autoThemeOptionScheme.themeRecord"
          :themeTrackOdd="autoThemeOptionScheme.themeTrackOdd"
        />
        <RadioTheme
          v-model="user.authd.settings.theme"
          name="theme"
          id="light"
          label="Light"
          themeBackground="hsl(40, 20%, 97%)"
          themePrimary="hsl(202, 50%, 45%)"
          themeSecondary="hsl(40, 16%, 90%)"
          themeDarkText="hsl(0, 0%, 41%)"
          themeRecord="hsl(42, 24%, 92%)"
          themeTrackOdd="hsl(42, 25%, 86%)"
        />
        <RadioTheme
          v-model="user.authd.settings.theme"
          name="theme"
          id="dark"
          label="Dark"
          themeBackground="hsl(216, 15%, 16%)"
          themePrimary="hsl(202, 70%, 55%)"
          themeSecondary="hsl(214, 13%, 24%)"
          themeDarkText="hsl(0, 0%, 41%)"
          themeRecord="hsl(216, 13%, 24%)"
          themeTrackOdd="hsl(216, 13%, 29%)"
        />
        <RadioTheme
          v-model="user.authd.settings.theme"
          name="theme"
          id="contrast"
          label="High contrast"
          themeBackground="hsl(0, 0%, 0%)"
          themePrimary="hsl(202, 100%, 50%)"
          themeSecondary="hsl(0, 0%, 12%)"
          themeDarkText="hsl(0, 0%, 100%)"
          themeRecord="hsl(0, 0%, 8%)"
          themeTrackOdd="hsl(0, 0%, 16%)"
        />
      </fieldset>

      <fieldset>
        <legend>Turntable colour</legend>
        <RadioDeck
          v-model="user.authd.settings.turntableTheme"
          name="turntable_colour"
          id="black"
          label="Black"
          :deckBackground="blackDeckBackground"
        />
        <RadioDeck
          v-model="user.authd.settings.turntableTheme"
          name="turntable_colour"
          id="silver"
          label="Silver"
          :deckBackground="silverDeckBackground"
        />
      </fieldset>

      <SelectInput
        id="turntable_pitch_range"
        v-model="user.authd.settings.turntablePitchRange"
        label="Turntable pitch range"
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

      <fieldset class="controls" v-if="user.authd._id">
        <legend>Discogs API</legend>
        <div v-if="user.authd.discogsUsername !== ''">
          <span class="username">
            Authorised as Discogs user <i>{{ user.authd.discogsUsername }}</i>
          </span>
        </div>
        <button
          v-if="user.authd.isDiscogsOAuthd"
          @click="discogs.revokeDiscogsModal = true"
        >
          Revoke Discogs access
        </button>
        <DiscogsControls />
      </fieldset>

      <fieldset class="controls" v-if="user.authd._id">
        <legend>Spotify API</legend>
        <button
          v-if="!user.authd.isSpotifyOAuthd"
          @click="spotify.authorisationRequest()"
        >
          Connect to Spotify
        </button>
        <button v-else @click="spotify.revokeSpotifyModal = true">
          Revoke Spotify access
        </button>
      </fieldset>
      <p v-else>Login to connect to the Spotify and Discogs APIs.</p>

      <fieldset class="controls" v-if="user.authd._id">
        <legend>Account management</legend>
        <button
          @click="
            ;(user.changePasswordModal = true), (user.settingsModal = false)
          "
        >
          Change password
        </button>
      </fieldset>
      <p v-else>Login to connect to the Spotify and Discogs APIs.</p>

      <SubmitlessFeedback />
    </div>
  </form>
</template>

<script setup lang="ts">
import { onBeforeMount, onUnmounted, watch } from "vue"
import { discogsStore } from "@/stores/discogsStore"
import { spotifyStore } from "@/stores/spotifyStore"
import { userStore } from "@/stores/userStore"
import DiscogsControls from "../discogs/DiscogsControls.vue"
import RadioDeck from "../inputs/RadioDeck.vue"
import RadioInput from "../inputs/RadioInput.vue"
import RadioTheme from "@/components/inputs/RadioTheme.vue"
import SelectInput from "../inputs/SelectInput.vue"
import SubmitlessFeedback from "@/components/feedbacks/SubmitlessFeedback.vue"
import XIcon from "@/components/icons/XIcon.vue"
const discogs = discogsStore()
const spotify = spotifyStore()
const user = userStore()

const turntablePitchOptions = [
  { id: "8", name: "±8%" },
  { id: "16", name: "±16%" },
  { id: "24", name: "±24%" },
  { id: "50", name: "±50%" },
]

const autoThemeOptionScheme = window.matchMedia("(prefers-color-scheme: dark)")
  .matches
  ? {
      themeBackground: "hsl(216, 15%, 16%)",
      themePrimary: "hsl(202, 70%, 55%)",
      themeSecondary: "hsl(214, 13%, 24%)",
      themeDarkText: "hsl(0, 0%, 41%)",
      themeRecord: "hsl(216, 13%, 24%)",
      themeTrackOdd: "hsl(216, 13%, 29%)",
    }
  : {
      themeBackground: "hsl(40, 20%, 97%)",
      themePrimary: "hsl(202, 50%, 45%)",
      themeSecondary: "hsl(40, 16%, 90%)",
      themeDarkText: "hsl(0, 0%, 41%)",
      themeRecord: "hsl(42, 24%, 92%)",
      themeTrackOdd: "hsl(42, 25%, 86%)",
    }

const silverDeckBackground = `linear-gradient(
    to right bottom,
    #8f8d97,
    #9d9ca6,
    #acacb4,
    #bbbcc3,
    #cbccd2,
    #cfd0d6,
    #d3d4d9,
    #d7d8dd,
    #d0d0d6,
    #c8c9cf,
    #c1c1c9,
    #babac2
  )`

const blackDeckBackground = `linear-gradient(
    to right bottom,
    #282727,
    #2d2c2c,
    #323132,
    #373737,
    #3c3c3c,
    #3c3c3c,
    #3c3c3c,
    #3c3c3c,
    #373737,
    #323132,
    #2d2c2c,
    #282727
  )`

function updateSettings() {
  if (user.authd._id) user.updateSettings()
}

// set theme on setting change
watch(
  () => user.authd.settings.theme,
  (theme: string) => {
    const root = document.querySelector(":root")
    switch (theme) {
      case "auto":
        root!.classList.remove("light")
        root!.classList.remove("dark")
        root!.classList.remove("contrast")
        break
      case "light":
        root!.classList.remove("light")
        root!.classList.remove("dark")
        root!.classList.remove("contrast")
        root!.classList.add("light")
        break
      case "dark":
        root!.classList.remove("light")
        root!.classList.remove("dark")
        root!.classList.remove("contrast")
        root!.classList.add("dark")
        break
      case "contrast":
        root!.classList.remove("light")
        root!.classList.remove("dark")
        root!.classList.remove("contrast")
        root!.classList.add("contrast")
        break
    }
  }
)

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
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 20px;
  &.controls {
    flex-direction: column;
    button {
      width: 220px;
    }
  }
}
</style>
