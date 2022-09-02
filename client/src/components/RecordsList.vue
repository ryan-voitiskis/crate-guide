<template>
  <div class="sort-by">
    <button
      class="inline-button"
      :class="{ active: state.sortBy == 'title', reversed: state.titleRvrs }"
      @click="
        state.sortBy === 'title'
          ? (state.titleRvrs = !state.titleRvrs)
          : (state.sortBy = 'title')
      "
    >
      Title <ChevronUpIcon />
    </button>
    <button
      class="inline-button"
      :class="{ active: state.sortBy == 'catno', reversed: state.catnoRvrs }"
      @click="
        state.sortBy === 'catno'
          ? (state.catnoRvrs = !state.catnoRvrs)
          : (state.sortBy = 'catno')
      "
    >
      Catalog # <ChevronUpIcon />
    </button>
    <button
      class="inline-button"
      :class="{
        active: state.sortBy == 'artists',
        reversed: state.artistsRvrs,
      }"
      @click="
        state.sortBy === 'artists'
          ? (state.artistsRvrs = !state.artistsRvrs)
          : (state.sortBy = 'artists')
      "
    >
      Artists <ChevronUpIcon />
    </button>
    <button
      class="inline-button"
      :class="{ active: state.sortBy == 'label', reversed: state.labelRvrs }"
      @click="
        state.sortBy === 'label'
          ? (state.labelRvrs = !state.labelRvrs)
          : (state.sortBy = 'label')
      "
    >
      Label <ChevronUpIcon />
    </button>
    <button
      class="inline-button"
      :class="{ active: state.sortBy == 'year', reversed: state.yearRvrs }"
      @click="
        state.sortBy === 'year'
          ? (state.yearRvrs = !state.yearRvrs)
          : (state.sortBy = 'year')
      "
    >
      Year <ChevronUpIcon />
    </button>
  </div>
  <div class="record-list">
    <RecordSingle
      v-for="record in sortedRecords"
      v-bind="record"
      :key="record._id"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from "vue"
import RecordSingle from "./RecordSingle.vue"
import Record from "@/interfaces/Record"
import { userStore } from "@/stores/userStore"
import { crateStore } from "@/stores/crateStore"
import { recordStore } from "@/stores/recordStore"
import ChevronUpIcon from "./svg/ChevronUpIcon.vue"
const user = userStore()
const crates = crateStore()
const records = recordStore()

const state = reactive({
  sortBy: "title",
  titleRvrs: false,
  catnoRvrs: false,
  artistsRvrs: false,
  labelRvrs: false,
  yearRvrs: false,
})

// records from selected crate to display
const recordsByCrate = computed((): Record[] =>
  user.authd.settings.selectedCrate !== "all"
    ? crates
        .getRecordsByCrate(user.authd.settings.selectedCrate)
        .map((i) => records.getById(i))
    : records.recordList
)

// sorts "" last
const sortStr = (field: keyof Record, reverse: boolean) => {
  // ? how to get param type to be ': Record' without error
  return (a: any, b: any) =>
    a[field] !== "" && b[field] !== ""
      ? (reverse ? -1 : 1) *
        a[field].localeCompare(b[field], undefined, { sensitivity: "base" }) // * both a + b defined
      : a[field] !== "" && b[field] === ""
      ? -1 // * a is defined, b is undefined: sort a before b
      : a[field] === "" && b[field] !== ""
      ? 1 // * a is undefined, b is defined: sort b before a
      : 0 // * both a + b undefined: keep original order
}

// sorts null last
const sortNum = (field: keyof Record, reverse: boolean) => {
  return (a: Record, b: Record) =>
    a[field] !== null && b[field] !== null
      ? (reverse ? -1 : 1) * ((a[field] as number) - (b[field] as number)) // * both a + b defined: sort lowest before highest, unless reversed
      : a[field] !== null && b[field] === null
      ? -1 // * a is defined, b is undefined: sort a before b
      : a[field] === null && b[field] !== null
      ? 1 // * a is undefined, b is defined: sort b before a
      : 0 // * both a + b undefined: keep original order
}

// sort records by title alphabetically
const sortedRecords = computed((): Record[] => {
  switch (state.sortBy) {
    case "catno":
      return [...recordsByCrate.value].sort(sortStr("catno", state.catnoRvrs))
    case "artists":
      return [...recordsByCrate.value].sort(
        sortStr("artists", state.artistsRvrs)
      )
    case "label":
      return [...recordsByCrate.value].sort(sortStr("label", state.labelRvrs))
    case "year":
      return [...recordsByCrate.value].sort(sortNum("year", state.yearRvrs))
    default: // default is title
      return [...recordsByCrate.value].sort(sortStr("title", state.titleRvrs))
  }
})
</script>

<style scoped lang="scss">
.record-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
}

.sort-by {
  button {
    width: 12rem;
    svg {
      transition: transform 0.4s;
    }
    &.active {
      font-weight: 600;
    }
    &.reversed {
      svg {
        transform: scaleY(-1);
      }
    }
  }
}
</style>
