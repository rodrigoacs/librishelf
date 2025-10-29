<template>
  <div class="card">
    <div class="header">
      <img
        width="80"
        height="80"
        src="https://img.icons8.com/external-smashingstocks-isometric-smashing-stocks/440/external-Bookshelf-interior-smashingstocks-isometric-smashing-stocks-3.png"
        alt="Librishelf logo"
      />
      <h1>Welcome to Librishelf</h1>
    </div>
    <p>
      Librishelf is a personal library management system that allows you to organize, track, and manage your
      book collections in a personalized, secure, and accessible way.
    </p>
    <p>
      For book lovers, keeping track of a growing collection can be challenging. Librishelf was born from the
      need for a simple yet powerful tool to catalog and manage books, offering a visually pleasing interface
      and intuitive features.
    </p>

    <h2>Features:</h2>
    <ul>
      <li><i class="pi pi-plus-circle"></i> Add new books to your collection with details such as author, publisher,
        publication
        date, and cover.</li>
      <li><i class="pi pi-check-circle"></i> Mark books as read and record the reading date.</li>
      <li><i class="pi pi-search"></i> Filter and search your library by title, author, or publisher.</li>
      <li><i class="pi pi-table"></i> View your collection in a responsive and attractive grid layout.</li>
    </ul>
  </div>
</template>

<style scoped>
.card {
  padding: 2rem;
  height: 95vh;
  width: 85vw;
  color: #ffffff;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  border-radius: 8px;
  text-align: justify;
}

.header {
  display: flex;
  align-items: center;
  gap: 1rem;
}

h1 {
  font-size: 2.2rem;
  color: var(--main-color);
  font-weight: 700;
}

h2 {
  font-size: 1.6rem;
  margin-top: 1rem;
  border-bottom: 2px solid var(--main-color);
  padding-bottom: 0.5rem;
  font-weight: 600;
}

p {
  line-height: 1.7;
  font-size: 1.1rem;
}

ul {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
  font-size: 1.1rem;
}

li {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

i {
  color: var(--main-color);
  font-size: 1.3rem;
}

@media (max-width: 768px) {
  .card {
    width: 95vw;
    padding: 1.5rem;
  }

  h1 {
    font-size: 1.8rem;
  }

  h2 {
    font-size: 1.4rem;
  }

  p,
  ul {
    font-size: 1rem;
  }
}
</style>