<template>
  <form v-on="user.hasUser() ? { change: updateSettings } : {}">
    <div class="form-body">
      <p v-if="!user.hasUser()">
        <b>You are not logged in.</b><br />Settings changed here are for this
        session only.
      </p>
      <fieldset>
        <legend>Theme</legend>
        <RadioInput
          v-model="user.loggedIn.settings.theme"
          name="theme"
          id="light"
          label="Light"
        />
        <RadioInput
          v-model="user.loggedIn.settings.theme"
          name="theme"
          id="dark"
          label="Dark"
        />
        <RadioInput
          v-model="user.loggedIn.settings.theme"
          name="theme"
          id="contrast"
          label="High contrast"
        />
      </fieldset>

      <fieldset>
        <legend>Turntable colour</legend>
        <RadioInput
          v-model="user.loggedIn.settings.turntableTheme"
          name="turntable_colour"
          id="silver"
          label="Silver"
        />
        <RadioInput
          v-model="user.loggedIn.settings.turntableTheme"
          name="turntable_colour"
          id="black"
          label="Black"
        />
      </fieldset>

      <label for="turntable_pitch"
        >Turntable pitch range
        <select
          v-model="user.loggedIn.settings.turntablePitchRange"
          id="turntable_pitch"
        >
          <option value="8">±8%</option>
          <option value="16">±16%</option>
          <option value="24">±24%</option>
          <option value="50">±50%</option>
        </select>
      </label>
      <SubmitlessFeedback
        :saving="user.loading"
        :saved="user.success"
        :failed="user.error"
      />
    </div>
  </form>
</template>

<script setup lang="ts">
import { onUnmounted } from "vue"
import { userStore } from "@/stores/userStore"
import RadioInput from "./RadioInput.vue"
import SubmitlessFeedback from "./SubmitlessFeedback.vue"
const user = userStore()

// ! freaks out when called directly from <form v-on="">. cpu usage spike + browser non-responsive
const updateSettings = () => user.updateSettings()

onUnmounted(() => {
  user.loading = false
  user.error = false
  user.success = false
})
</script>

<style scoped lang="scss"></style>
