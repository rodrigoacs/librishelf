# Librishelf: Your Digital Bookshelf 📚

**Librishelf** is a personal library management system that allows you to organize, track, and manage your book collections in a personalized, secure, and accessible way.

-----

## 🌟 About the Project

For book lovers, keeping track of a growing collection can be a challenge. Librishelf was born from the need for a simple yet powerful tool to catalog and manage books, offering a visually pleasing interface and intuitive features.

With Librishelf, you can:

  * Add new books to your collection with details like author, publisher, publication date, and cover art.
  * Mark books as read and record the reading date.
  * Filter and search your library by title, author, or publisher.
  * View your collection in a responsive and attractive grid layout.

### ✨ Tech Stack

  * **Frontend:**
      * [Vue.js](https://vuejs.org/)
      * [PrimeVue](https://primevue.org/)
  * **Backend:**
      * [Node.js](https://nodejs.org/)
      * [Express](https://expressjs.com/)
  * **Database:**
      * [PostgreSQL](https://www.postgresql.org/)

-----

## 🚀 Getting Started

To get Librishelf up and running on your local machine, follow these simple steps.

### Prerequisites

  * Node.js and npm
  * PostgreSQL
  * Vue CLI

### Installation

1.  **Clone the repository:**

    ```sh
    git clone https://github.com/rodrigoacs/Librishelf.git
    cd Librishelf
    ```

2.  **Install backend dependencies:**

    ```sh
    cd backend
    npm install
    ```

3.  **Install frontend dependencies:**

    ```sh
    cd ../frontend
    npm install
    ```

4.  **Set up environment variables:**

    Create a `.env` file in the `backend/src` folder and fill it with your database credentials:

    ```plaintext
    DB_USER=
    DB_HOST=
    DB_NAME=
    DB_PASSWORD=
    DB_PORT=
    SECRET_KEY=
    ```

### Running the Application

1.  **Start the backend server:**
    ```sh
    cd backend
    npm run server
    ```
2.  **Start the frontend development server:**
    ```sh
    cd ../frontend
    npm run dev
    ```

-----

## 📖 Features

  * **User Authentication:** Secure login and registration system to protect your collection.
  * **Add Books:** Easily add new books with detailed information and a cover image.
  * **Grid View:** Browse your collection with a beautiful grid display of book covers.
  * **Search and Filter:** Quickly find books with filters for title, author, and publisher.
  * **Mark as Read:** Track your reading progress by marking books as read.
  * **Edit Details:** Edit the information of any book on your shelf.

-----

## 🎉 Join Us\!

Create your account and start managing your library today at [librishelf.com](https://librishelf.com)\!

-----

## 🤝 Contributing

Any contributions you make are **greatly appreciated**.

1.  **Fork the Project**
2.  **Create your Feature Branch:** `git checkout -b feature/AmazingFeature`
3.  **Commit your Changes:** `git commit -m 'Add some AmazingFeature'`
4.  **Push to the Branch:** `git push origin feature/AmazingFeature`
5.  **Open a Pull Request**

-----

Made with ❤️ by **[acs](https://github.com/rodrigoacs)**