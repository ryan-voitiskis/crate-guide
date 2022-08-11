<template>
  <form>
    <div class="form-body">
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
    </div>
  </form>
</template>

<script setup lang="ts">
import RadioInput from "@/components/forms/RadioInput.vue"
import { userStore } from "@/stores/user"
const user = userStore()
</script>

<style scoped lang="scss"></style>
