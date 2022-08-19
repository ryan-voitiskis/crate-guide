<template>
  <form v-on="user.hasUser() ? { change: updateUserSettings } : {}">
    <div class="form-body">
      <p v-if="!user.hasUser()">
        <b>You are not logged in.</b><br />Settings changed here are for this
        session only.
      </p>
      <fieldset>
        <legend>Theme</legend>
        <RadioInput
          v-model="user.settings.theme"
          name="theme"
          id="light"
          label="Light"
        />
        <RadioInput
          v-model="user.settings.theme"
          name="theme"
          id="dark"
          label="Dark"
        />
        <RadioInput
          v-model="user.settings.theme"
          name="theme"
          id="contrast"
          label="High contrast"
        />
      </fieldset>

      <fieldset>
        <legend>Turntable colour</legend>
        <RadioInput
          v-model="user.settings.turntableTheme"
          name="turntable_colour"
          id="silver"
          label="Silver"
        />
        <RadioInput
          v-model="user.settings.turntableTheme"
          name="turntable_colour"
          id="black"
          label="Black"
        />
      </fieldset>

      <label for="turntable_pitch"
        >Turntable pitch range
        <select
          v-model="user.settings.turntablePitchRange"
          id="turntable_pitch"
        >
          <option value="8">±8%</option>
          <option value="16">±16%</option>
          <option value="24">±24%</option>
          <option value="50">±50%</option>
        </select>
      </label>
      <SubmitlessFeedback :state="state" />
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, inject } from "vue"
import { userStore } from "@/stores/userStore"
import RadioInput from "./RadioInput.vue"
import SubmitlessFeedback from "./SubmitlessFeedback.vue"
const API_URL = inject("API_URL")
const user = userStore()

const state = reactive({
  saving: false,
  saved: false,
  failed: false,
})

const updateUserSettings = async () => {
  state.failed = false
  state.saved = false
  state.saving = true

  const body = new URLSearchParams()
  body.append("settings.theme", user.settings.theme)
  body.append("settings.turntableTheme", user.settings.turntableTheme)
  body.append("settings.turntablePitchRange", user.settings.turntablePitchRange)

  const options = {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${user.token}`,
    },
    body: body,
  }

  try {
    const response = await fetch(API_URL + "users/" + user.id, options)
    if (response.status === 200) {
      state.saved = true

      // handle 400 and 401 status codes. see userController.js
    } else {
      const data = await response.json()
      console.error(data.message)
      state.failed = true
    }
  } catch (error) {
    console.error(error)
  }
  state.saving = false
}
</script>

<style scoped lang="scss"></style>
