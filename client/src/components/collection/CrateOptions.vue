<template>
  <div class="options-dropout">
    <div class="button-wrapper">
      <button class="toggle" type="button" @click="state.show = !state.show">
        <transition name="fade">
          <WrenchIcon v-if="!state.show" />
        </transition>
        <transition name="fade">
          <ChevronUpIcon class="chevron-up" v-if="state.show" />
        </transition>
      </button>
    </div>
    <transition name="drop">
      <div class="options" v-if="state.show">
        <button
          class="icon-button"
          @click="crates.duplicateCrateModal = true"
          v-if="user.authd.settings.selectedCrate !== 'all'"
        >
          <DuplicateIcon /> Duplicate
        </button>
        <button
          class="icon-button"
          @click="crates.deleteCrateModal = true"
          v-if="user.authd.settings.selectedCrate !== 'all'"
        >
          <TrashIcon /> Delete
        </button>
        <button class="icon-button" @click="crates.addCrateModal = true">
          <FolderPlusIcon /> Add new
        </button>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { reactive } from "vue"
import ChevronUpIcon from "@/components/icons/ChevronUpIcon.vue"
import { crateStore } from "@/stores/crateStore"
import { userStore } from "@/stores/userStore"
import TrashIcon from "../icons/TrashIcon.vue"
import DuplicateIcon from "../icons/DuplicateIcon.vue"
import FolderPlusIcon from "../icons/FolderPlusIcon.vue"
import WrenchIcon from "../icons/WrenchIcon.vue"
const crates = crateStore()
const user = userStore()

const state = reactive({
  show: false,
})
</script>

<style scoped lang="scss">
.options-dropout {
  font-size: 1.3rem;
  display: flex;
  margin-top: 2.9rem;
  margin-bottom: 1.5rem;
  span {
    color: var(--light-text);
    align-self: center;
  }
  // wrapper exists to work around button resizing when fixed bug
  .button-wrapper {
    height: 3.8rem;
    width: 3.8rem;
    margin-right: 1rem;
  }
  button.toggle {
    width: 3.8rem;
    padding: 0 0.8rem;
    svg {
      position: absolute;
    }
  }
}

.options {
  display: flex;
  gap: 1rem;
  width: auto;
}

.chevron-up {
  transform: rotate(-90deg);
}

.fade-enter-active {
  animation: fade-in 0.6s linear;
}

.drop-enter-active {
  animation: drop-out-500 0.2s linear;
}

.drop-leave-active {
  animation: drop-in-500 0.2s linear;
}
</style>
