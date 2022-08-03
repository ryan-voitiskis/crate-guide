<template>
  <h1>Collection</h1>
  <RecordsList />
  <button @click="openAddRecord">Add new record</button>

  <FormModal
    v-if="showAddRecord"
    @close="showAddRecord = false"
    title="Add record"
    modal-width="440px"
  >
    <AddRecordForm />
  </FormModal>
</template>

<script setup lang="ts">
import { ref } from "vue"
import AddRecordForm from "@/components/forms/AddRecordForm.vue"
import RecordsList from "@/components/RecordsList.vue"
import FormModal from "@/components/forms/FormModal.vue"

const showAddRecord = ref(false)
const openAddRecord = () => (showAddRecord.value = true)
</script>

<style scoped lang="scss"></style>
