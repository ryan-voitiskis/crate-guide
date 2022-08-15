<template>
  <!-- move to component -->
  <div id="crate_controls" v-if="user.hasUser()">
    <label for="crate_select"
      >Crate
      <select name="crate" id="crate_select">
        <!-- v-for="crate in crates" -->
        <option>placeholder 1</option>
        <option>placeholder 2</option>
        <option>placeholder 3</option>
      </select>
    </label>
    <button @click="state.addCrate = true">Add crate</button>
  </div>

  <!-- move to component -->
  <div id="crate_manager" v-if="user.hasUser()">
    <button @click="state.addRecord = true">Add record</button>
  </div>

  <RecordsList v-if="user.hasUser()" />

  <p v-if="!user.hasUser()">Sign in to create collections.</p>

  <FormModal
    v-if="state.addCrate"
    @close="state.addCrate = false"
    title="Add crate"
    modal-width="440px"
  >
    <AddCrateForm @close="state.addCrate = false" />
  </FormModal>

  <FormModal
    v-if="state.addRecord"
    @close="state.addRecord = false"
    title="Add record"
    modal-width="440px"
  >
    <AddRecordForm @close="state.addRecord = false" />
  </FormModal>
</template>

<script setup lang="ts">
import { reactive } from "vue"
import AddCrateForm from "@/components/forms/AddCrateForm.vue"
import AddRecordForm from "@/components/forms/AddRecordForm.vue"
import RecordsList from "@/components/RecordsList.vue"
import FormModal from "@/components/forms/FormModal.vue"
import { userStore } from "@/stores/user"
const user = userStore()

const state = reactive({
  addCrate: false,
  addRecord: false,
})
</script>

<style scoped lang="scss"></style>
