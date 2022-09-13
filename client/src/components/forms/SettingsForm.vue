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

      <fieldset>
        <legend>Discogs API</legend>
        <button
          @click=";(user.enterDiscogsUsername = true), $parent!.$emit('close')"
        >
          {{ user.authd.discogsUID === "" ? "Provide" : "Update" }} discogs
          username
        </button>
        <button
          v-if="user.authd.discogsToken === ''"
          @click=";(user.authDiscogs = true), $parent!.$emit('close')"
        >
          Connect to discogs
        </button>
        <button v-else>Revoke discogs access</button>
      </fieldset>
      <SubmitlessFeedback
        :saving="user.loading"
        :saved="user.success"
        :failed="user.error"
      />
    </div>
  </form>
</template>

<script setup lang="ts">
import { onBeforeMount, onUnmounted } from "vue"
import RadioCard from "./inputs/RadioCard.vue"
import SubmitlessFeedback from "./feedbacks/SubmitlessFeedback.vue"
import XIcon from "@/components/svg/XIcon.vue"
import { userStore } from "@/stores/userStore"
const user = userStore()

// ! freaks out when called directly from <form v-on="">. cpu usage spike + browser non-responsive
const updateSettings = () => user.updateSettings()

// req'd for when settings changed elsewhere, such as selected crate
onBeforeMount(() => {
  user.loading = false
  user.error = false
  user.success = false
})

onUnmounted(() => {
  user.loading = false
  user.error = false
  user.success = false
})
</script>

<style scoped lang="scss">
fieldset {
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
}
</style>
