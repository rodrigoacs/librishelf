<template>
  <EntityListView
    i18n-key="publishers"
    :fetcher="() => api.getPublishers()"
    query-param="publisher"
    icon="pi-building"
    variant="icon"
    empty-key="publishers.notFound"
    error-key="publishers.loadError"
    view-key="publishers.viewCollection"
  />
</template>

<script setup>
import EntityListView from '../components/EntityListView.vue'
import api from '../services/api.js'
</script>
