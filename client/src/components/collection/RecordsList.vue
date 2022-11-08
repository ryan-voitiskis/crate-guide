<template>
  <BasicInput type="search" v-model="state.searchTerm" placeholder="Search" />
  <div class="list-controls">
    <label class="checkbox-hitbox">
      <input type="checkbox" v-model="records.checkAll" />
    </label>
    <SortByButton
      class="sort-by-button"
      title="Title"
      :active="state.sortBy === 'title'"
      :reversed="state.titleRvrs"
      @activate="state.sortBy = 'title'"
      @reverse="state.titleRvrs = !state.titleRvrs"
    />
    <SortByButton
      class="sort-by-button"
      title="Catalog No."
      :active="state.sortBy === 'catno'"
      :reversed="state.catnoRvrs"
      @activate="state.sortBy = 'catno'"
      @reverse="state.catnoRvrs = !state.catnoRvrs"
    />
    <SortByButton
      class="sort-by-button"
      title="Artists"
      :active="state.sortBy === 'artists'"
      :reversed="state.artistsRvrs"
      @activate="state.sortBy = 'artists'"
      @reverse="state.artistsRvrs = !state.artistsRvrs"
    />
    <SortByButton
      class="sort-by-button"
      title="Label"
      :active="state.sortBy === 'label'"
      :reversed="state.labelRvrs"
      @activate="state.sortBy = 'label'"
      @reverse="state.labelRvrs = !state.labelRvrs"
    />
    <SortByButton
      class="sort-by-button"
      title="Year"
      :active="state.sortBy === 'year'"
      :reversed="state.yearRvrs"
      @activate="state.sortBy = 'year'"
      @reverse="state.yearRvrs = !state.yearRvrs"
    />
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
import { computed, reactive, watch } from "vue"
import BasicInput from "@/components/inputs/BasicInput.vue"
import RecordSingle from "./RecordSingle.vue"
import Record from "@/interfaces/Record"
import SortByButton from "./SortByButton.vue"
import { sortStr, sortNumWithNull } from "@/utils/sortFunctions"
import localeContains from "@/utils/localeContains"
import { userStore } from "@/stores/userStore"
import { crateStore } from "@/stores/crateStore"
import { recordStore } from "@/stores/recordStore"
const user = userStore()
const crates = crateStore()
const records = recordStore()

const state = reactive({
  selectAll: false,
  searchTerm: "",
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
        .getRecordIDsByCrate(user.authd.settings.selectedCrate)
        .map((i) => records.getById(i))
    : records.recordList
)

// records filtered by search term, searches title, artists, catno, label, year and track titles
const searchedRecords = computed((): Record[] =>
  state.searchTerm !== ""
    ? recordsByCrate.value.filter((i) => {
        if (localeContains(i.title, state.searchTerm)) return true
        if (localeContains(i.artists, state.searchTerm)) return true
        if (localeContains(i.catno, state.searchTerm)) return true
        if (localeContains(i.label, state.searchTerm)) return true
        if (
          i.tracks.find((t) =>
            t.title.toUpperCase().includes(state.searchTerm.toUpperCase())
          )
        )
          return true
        if (i.year !== undefined)
          if (state.searchTerm === i.year.toString()) return true
          else return false
        else return false
      })
    : recordsByCrate.value
)

// sort records by title alphabetically
const sortedRecords = computed((): Record[] => {
  switch (state.sortBy) {
    case "catno":
      return [...searchedRecords.value].sort(sortStr("catno", state.catnoRvrs))
    case "artists":
      return [...searchedRecords.value].sort(
        sortStr("artists", state.artistsRvrs)
      )
    case "label":
      return [...searchedRecords.value].sort(sortStr("label", state.labelRvrs))
    case "year":
      return [...searchedRecords.value].sort(
        sortNumWithNull("year", state.yearRvrs)
      )
    default: // default is title
      return [...searchedRecords.value].sort(sortStr("title", state.titleRvrs))
  }
})

// if select/deselect all checkbox is unchecked, clear checkboxed array
watch(
  () => records.checkAll,
  () => {
    if (records.checkAll === false) records.checkboxed = []
  }
)
</script>

<style scoped lang="scss">
.list-controls {
  .checkbox-hitbox {
    margin: 0;
  }
  width: 100%;
  display: flex;
  gap: 1rem;
  align-items: center;
}
.record-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
}

.sort-by-button {
  width: 12rem;
}
</style>
