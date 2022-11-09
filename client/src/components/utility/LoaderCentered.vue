<template>
  <div class="loader-container"><LoaderIcon /></div>
</template>

<script setup lang="ts">
import LoaderIcon from "@/components/icons/LoaderIcon.vue"
</script>

<style scoped lang="scss">
.loader-container {
  width: 100%;
  display: flex;
  justify-content: center;
  color: var(--btn-primary);
}
</style>
