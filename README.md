# Librishelf

Librishelf is a library management system that enables users to organize, track, and manage their personal book collections. With user authentication and custom book storage features, Librishelf provides a personalized, secure, and accessible way to manage personal libraries.

Librishelf é um sistema de gerenciamento de bibliotecas que permite aos usuários organizar, acompanhar e gerenciar suas coleções pessoais de livros. Com recursos de autenticação e armazenamento personalizado, o Librishelf oferece uma maneira personalizada, segura e acessível de gerenciar bibliotecas pessoais.

---


## Tech Stack / Tecnologias

- **Frontend**: Vue 3, PrimeVue.
- **Backend**: Node.js, Express, JWT.
- **Database / Banco de Dados**: PostgreSQL.

## Folder Structure / Estrutura de Pastas

```plaintext
/librishlef
├── /backend
├── /frontend
└── README.md
```

## Getting Started / Primeiros Passos

### Prerequisites / Pré-requisitos

- Node.js and npm
- PostgreSQL
- Vue CLI

### Installation / Instalação

1. **Clone the repository / Clone o repositório**:
   ```sh
   git clone https://github.com/rodrigoacs/Librishelf.git
   cd Librishelf
   ```

2. **Install backend dependencies / Instale dependências do backend**:
   ```sh
   cd backend
   npm install
   ```

3. **Install frontend dependencies / Instale dependências do frontend**:
   ```sh
   cd frontend
   npm install
   ```

4. **Set up environment variables / Configure variáveis de ambiente**:
  
    `backend/src/.env`
     ```plaintext
      DB_USER=
      DB_HOST=
      DB_NAME=
      DB_PASSWORD=
      DB_PORT=
      SECRET_KEY=
     ```

### Running the Application / Executando a Aplicação

1. **Start the backend server / Inicie o servidor backend**:
   ```sh
   cd backend
   npm run server
   ```

2. **Start the frontend development server / Inicie o servidor de desenvolvimento frontend**:
   ```sh
   cd ../frontend
   npm run dev
   ```

## API Endpoints / Endpoints da API

Soon / Em breve

## Contributing / Contribuindo

1. **Fork the project / Crie um fork**.
2. **Create a feature branch / Crie um branch para a nova funcionalidade**: `git checkout -b feature/your-feature`
3. **Commit your changes / Faça commit das alterações**: `git commit -m 'Add feature'`
4. **Push to the branch / Envie para o branch**: `git push origin feature/your-feature`
5. **Open a pull request / Abra um pull request**


## Contact / Contato

- **Project Maintainer / Mantenedor do Projeto**: Rodrigo Soares
- **Email**: rodrigohths@gmail.com
