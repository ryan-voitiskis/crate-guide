<template>
  <div class="record-list"></div>
  <p>test</p>
  <RecordSingle />
</template>

<script lang="ts">
import { defineComponent } from "vue"
import RecordSingle from "@/components/RecordSingle.vue"

export default defineComponent({
  name: "RecordList",
  components: { RecordSingle },
})
</script>

<style scoped lang="scss"></style>
