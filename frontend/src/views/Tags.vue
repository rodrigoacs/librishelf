<template>
  <EntityListView
    i18n-key="tags"
    :fetcher="() => api.getTags()"
    query-param="tags"
    icon="pi-tags"
    variant="tag"
    empty-key="tags.empty"
    error-key="tags.error"
    view-key="tags.viewBooks"
  />
</template>

<script setup>
import EntityListView from '../components/EntityListView.vue'
import api from '../services/api.js'
</script>
