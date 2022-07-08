<template>
  <SettingControl />
  <SettingControl />
</template>

<script lang="ts">
import { defineComponent } from "vue";
import SettingControl from "@/components/SettingControl.vue"; // @ is an alias to /src

export default defineComponent({
  name: "SettingsManager",
  components: {
    SettingControl,
  },
});
</script>

<style scoped lang="scss"></style>
