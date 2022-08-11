<template>
  <form>
    <div class="form-body">
      <p v-if="user.id == 0">
        <b>You are not logged in.</b><br />Settings changed here are for this
        session only.
      </p>
      <fieldset>
        <legend>Theme</legend>
        <RadioInput
          @change="updateUserSettings"
          v-model="user.settings.theme"
          name="theme"
          id="light"
          label="Light"
        />
        <RadioInput
          @change="updateUserSettings"
          v-model="user.settings.theme"
          name="theme"
          id="dark"
          label="Dark"
        />
        <RadioInput
          @change="updateUserSettings"
          v-model="user.settings.theme"
          name="theme"
          id="contrast"
          label="High contrast"
        />
      </fieldset>

      <fieldset>
        <legend>Turntable colour</legend>
        <RadioInput
          @change="updateUserSettings"
          v-model="user.settings.turntableTheme"
          name="turntable_colour"
          id="silver"
          label="Silver"
        />
        <RadioInput
          @change="updateUserSettings"
          v-model="user.settings.turntableTheme"
          name="turntable_colour"
          id="black"
          label="Black"
        />
      </fieldset>

      <label for="turntable_pitch"
        >Turntable pitch range
        <select
          @change="updateUserSettings"
          v-model="user.settings.turntablePitchRange"
          id="turntable_pitch"
        >
          <option value="8">±8%</option>
          <option value="16">±16%</option>
          <option value="24">±24%</option>
          <option value="50">±50%</option>
        </select>
      </label>
    </div>
  </form>
</template>

<script setup lang="ts">
import RadioInput from "@/components/forms/RadioInput.vue"
import { userStore } from "@/stores/user"
const user = userStore()

// TODO: set up env or global var for this
const API_URL = "http://localhost:5000/api/users/"

const updateUserSettings = () => {
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

  fetch(API_URL + user.id, options)
    .then((response) => response.json())
    .then((data) => {
      if (data._id !== undefined) {
        console.log(data) // TODO: show confirmation in UI
      } else {
        console.log("update failed") // TODO: show confirmation in UI
      }
    })
    .catch((error) => console.log("error", error))
}
</script>

<style scoped lang="scss"></style>
