<template>
  <div class="modal-body" v-html="text"></div>
  <div class="modal-controls">
    <button class="close" type="button" @click="$parent!.$emit('close')">
      Close
    </button>
  </div>
</template>

<script setup lang="ts">
import { defineProps, onBeforeUnmount } from "vue"
import { recordStore } from "@/stores/recordStore"
import { crateStore } from "@/stores/crateStore"
const records = recordStore()
const crates = crateStore()

defineProps<{
  text: string
}>()

onBeforeUnmount(() => {
  records.feedbackMsg = ""
  crates.feedbackMsg = ""
})
</script>

<style scoped lang="scss"></style>
