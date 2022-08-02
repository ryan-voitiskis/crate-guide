<template>
  <h1>Collection</h1>
  <div v-if="showAddRecord">
    <FormModal @close="showAddRecord = !showAddRecord" title="Add record">
      <AddRecordForm />
    </FormModal>
  </div>
  <RecordsList />
  <button class="toggle-form-modal" @click="toggleAddRecord">
    Add new record
  </button>
</template>

<script setup lang="ts">
import { ref } from "vue"
import AddRecordForm from "@/components/AddRecordForm.vue"
import RecordsList from "@/components/RecordsList.vue"
import FormModal from "@/components/FormModal.vue"

const showAddRecord = ref(false)
const toggleAddRecord = () => (showAddRecord.value = !showAddRecord.value)
</script>

<style scoped lang="scss"></style>
