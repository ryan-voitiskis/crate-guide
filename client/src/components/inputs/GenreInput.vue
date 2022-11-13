<template>
  <label :for="id">Genres</label>
  <div class="input-container">
    <input
      class="genre-input"
      v-model="form.genreInput"
      v-bind="$attrs"
      :id="id"
      autocomplete="off"
      type="text"
      maxlength="40"
      placeholder="Genre (recommended)"
      @input="updateEmptyStatus"
      @keypress.prevent.enter="addGenre"
      v-focus
    />
    <button class="add add-genre" @click.prevent="addGenre">
      <PlusCircleIcon />
    </button>
    <span v-if="addOrClearMsg">Please add or clear genre field.</span>
  </div>

  <div class="genre-list">
    <div class="genre" v-for="(genre, index) in genres" :key="index">
      {{ genre }}
      <button @click.prevent="$emit('removeGenre', index)">
        <XIcon />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineProps, reactive, defineEmits } from "vue"
import XIcon from "@/components/icons/XIcon.vue"
import PlusCircleIcon from "../icons/PlusCircleIcon.vue"

const props = defineProps<{
  genres: string[]
  id?: string
  focused?: boolean
  addOrClearMsg: boolean
}>()

const form = reactive({
  genreInput: "",
})

const emit = defineEmits<{
  (e: "updateEmptyStatus", isEmpty: boolean): void
  (e: "addGenre", genre: string): void
  (e: "removeGenre", index: number): void
}>()

const updateEmptyStatus = () =>
  form.genreInput
    ? emit("updateEmptyStatus", false)
    : emit("updateEmptyStatus", true)

const addGenre = () => {
  if (form.genreInput.trim()) {
    emit("addGenre", form.genreInput.trim())
    form.genreInput = ""
  }
}

// custom directive to focus input el if focused prop. used to focus first input.
const vFocus = {
  mounted: (el: any) => {
    if (props.focused) el.focus()
  },
}
</script>

<style scoped lang="scss">
.input-container {
  display: flex;
  flex-wrap: wrap;
  grid-column: 2/3;
  width: 100%;
  .genre-input {
    width: 80%;
    border-right: 0;
    border-radius: 8px 0 0 8px;
  }
  .add-genre {
    border: 1px solid var(--input-border);
    width: 20%;
    border-radius: 0 8px 8px 0;
  }
  span {
    text-align: center;
    color: var(--error);
    width: 100%;
  }
}

.genre-list {
  display: flex;
  flex-wrap: wrap;
  grid-column: 1/3;
  gap: 10px;
  .genre {
    display: flex;
    height: 28px;
    line-height: 28px;
    background-color: var(--btn-secondary);
    border-radius: 4px;
    padding-left: 10px;
    button {
      border-radius: 0 4px 4px 0;
      margin-left: 10px;
      height: 28px;
      width: 28px;
      padding: 0;
      background-color: transparent;
      &:hover {
        background-color: var(--btn-secondary-hover);
      }
    }
  }
}
</style>
