<template>
  <div class="input-controls" v-if="user.hasUser()">
    <CrateSelect
      selectID="collection_crate_select"
      label="Crate"
      width="240px"
    />
    <CrateOptions />
    <div class="input-wrapper">
      <BasicInput
        v-model="state.searchTitle"
        label="Search title"
        type="text"
        autocomplete="off"
        width="240px"
      />
    </div>
    <div class="input-wrapper">
      <BasicInput
        v-model="state.searchArtists"
        label="Search artist"
        type="text"
        autocomplete="off"
        width="240px"
      />
    </div>
    <div class="input-wrapper">
      <BasicInput
        v-model="state.filterYear"
        label="Filter year"
        type="text"
        placeholder="1990-2000"
        autocomplete="off"
        width="120px"
      />
    </div>
    <button class="clear-filters icon-button" @click="clearFilters()">
      <FilterOffIcon />Clear filters
    </button>
  </div>
  <div class="sort-controls">
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
import SortByButton from "@/components/utility/SortByButton.vue"
import { sortStr, sortNumWithNull } from "@/utils/sortFunctions"
import localeContains from "@/utils/localeContains"
import { userStore } from "@/stores/userStore"
import { crateStore } from "@/stores/crateStore"
import { recordStore } from "@/stores/recordStore"
import CrateSelect from "../inputs/CrateSelect.vue"
import CrateOptions from "./CrateOptions.vue"
import FilterOffIcon from "@/components/icons/FilterOffIcon.vue"
const user = userStore()
const crates = crateStore()
const records = recordStore()
const yearsFilterRx = /^\d{4}\s*-\s*\d{4}$/
const yearFilterRx = /^\d{4}$/

const state = reactive({
  selectAll: false,
  searchTitle: "",
  searchArtists: "",
  filterYear: "",
  sortBy: "title",
  titleRvrs: false,
  catnoRvrs: false,
  artistsRvrs: false,
  labelRvrs: false,
  yearRvrs: false,
})

const clearFilters = () => {
  state.searchTitle = ""
  state.searchArtists = ""
  state.filterYear = ""
}

// records from selected crate to display
const recordsByCrate = computed((): Record[] =>
  user.authd.settings.selectedCrate !== "all"
    ? crates
        .getRecordIDsByCrate(user.authd.settings.selectedCrate)
        .map((i) => records.getById(i))
    : records.recordList
)

const titleSearchedRecords = computed((): Record[] =>
  state.searchTitle !== ""
    ? recordsByCrate.value.filter((i) =>
        localeContains(i.title, state.searchTitle)
      )
    : recordsByCrate.value
)

const artistsSearchedRecords = computed((): Record[] =>
  state.searchArtists !== ""
    ? titleSearchedRecords.value.filter((i) =>
        localeContains(i.artists, state.searchArtists)
      )
    : titleSearchedRecords.value
)

const yearFilteredRecords = computed((): Record[] => {
  if (yearsFilterRx.test(state.filterYear.trim())) {
    const years = state.filterYear.matchAll(/\d{4}/g)
    const year1 = parseInt(years.next().value[0])
    const year2 = parseInt(years.next().value[0])
    if (year1 && year2)
      return artistsSearchedRecords.value.filter(
        (i) => year1 <= i.year && i.year <= year2
      )
  } else if (yearFilterRx.test(state.filterYear.trim()))
    return artistsSearchedRecords.value.filter(
      (i) => parseInt(state.filterYear.trim()) === i.year
    )
  return artistsSearchedRecords.value
})

// sort records by title alphabetically
const sortedRecords = computed((): Record[] => {
  switch (state.sortBy) {
    case "catno":
      return [...yearFilteredRecords.value].sort(
        sortStr("catno", state.catnoRvrs)
      )
    case "artists":
      return [...yearFilteredRecords.value].sort(
        sortStr("artists", state.artistsRvrs)
      )
    case "label":
      return [...yearFilteredRecords.value].sort(
        sortStr("label", state.labelRvrs)
      )
    case "year":
      return [...yearFilteredRecords.value].sort(
        sortNumWithNull("year", state.yearRvrs)
      )
    default: // default is title
      return [...yearFilteredRecords.value].sort(
        sortStr("title", state.titleRvrs)
      )
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
.input-controls {
  display: flex;
  column-gap: 10px;
  flex-wrap: wrap;
}
.clear-filters {
  justify-self: end;
  margin-top: 29px;
}
.sort-controls {
  .checkbox-hitbox {
    margin: 0;
  }
  width: 100%;
  display: flex;
  gap: 10px;
  align-items: center;
}
.record-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.sort-by-button {
  width: 120px;
}
</style>
