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

      <fieldset class="discogs-ctrls">
        <legend>Discogs API</legend>

        <div v-if="user.authd.discogsUID" class="existing-uid">
          <label>Username</label><span>{{ user.authd.discogsUID }}</span>
          <button
            @click="user.enterDiscogsUsername = true"
            class="inline-btn edit"
          >
            <PencilIcon />
          </button>
          <button
            @click=";(user.authd.discogsUID = ``), updateSettings()"
            class="inline-btn delete"
          >
            <TrashIcon />
          </button>
        </div>
        <button v-else @click="user.enterDiscogsUsername = true">
          Provide discogs username
        </button>

        <button
          v-if="!user.authd.discogsToken"
          @click="user.authDiscogs = true"
        >
          Connect to discogs
        </button>
        <button class="ctrl" v-else>Revoke discogs access</button>
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
import PencilIcon from "../svg/PencilIcon.vue"
import TrashIcon from "../svg/TrashIcon.vue"
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
  &.discogs-ctrls {
    flex-direction: column;
    button.inline-btn {
      height: 3.8rem;
    }
    .ctrl {
      width: 24rem;
    }
    .existing-uid {
      display: flex;
      gap: 1rem;
      label,
      span {
        margin: 0;
        display: inline-block;
        line-height: 3.8rem; // ! btn
        height: 3.8rem;
      }
    }
  }
}
</style>
