<template>
  <form v-on="user.id != '' ? { change: updateUserSettings } : {}">
    <div class="form-body">
      <p v-if="user.id == ''">
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
import { reactive } from "vue"
import { userStore } from "@/stores/user"
import RadioInput from "./RadioInput.vue"
import SubmitlessFeedback from "./SubmitlessFeedback.vue"
const user = userStore()

// TODO: set up env or global var for this
const API_URL = "http://localhost:5000/api/users/"

const state = reactive({
  saving: false,
  saved: false,
  failed: false,
})

const updateUserSettings = () => {
  console.log("ran")

  state.failed = false
  state.saved = false
  state.saving = true
  const urlencoded = new URLSearchParams()
  urlencoded.append("settings.theme", user.settings.theme)
  urlencoded.append("settings.turntableTheme", user.settings.turntableTheme)
  urlencoded.append(
    "settings.turntablePitchRange",
    user.settings.turntablePitchRange
  )

  const options = {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${user.token}`,
    },
    body: urlencoded,
  }
  // comment this out to test animation
  fetch(API_URL + user.id, options)
    .then((response) => response.json())
    .then((data) => {
      if (data._id !== undefined) {
        state.saved = true
      } else {
        state.failed = true
      }
    })
    .catch((error) => console.log("error", error))
  state.saving = false

  // // this version of the fetch call for testing animation
  // setTimeout(() => {
  //   fetch(API_URL + user.id, options)
  //     .then((response) => response.json())
  //     .then((data) => {
  //       if (data._id !== undefined) {
  //         state.saved = true
  //       } else {
  //         state.failed = true
  //       }
  //     })
  //     .catch((error) => console.log("error", error))
  //   state.saving = false
  // }, 2000)
}
</script>

<style scoped lang="scss"></style>