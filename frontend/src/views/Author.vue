<template>
  <EntityListView
    i18n-key="authors"
    :fetcher="() => api.getAuthors()"
    query-param="author"
    icon="pi-users"
    variant="initials"
    empty-key="authors.notFound"
    error-key="authors.loadError"
    view-key="authors.viewBooks"
  />
</template>

<script setup>
import EntityListView from '../components/EntityListView.vue'
import api from '../services/api.js'
</script>
