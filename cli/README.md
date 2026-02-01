# boil-gen

A powerful CLI to scaffold standard MERN stack applications with AI-powered architecture generation.

## Features

- 🚀 **AI-Powered Architecture**: Generates project structure based on your natural language description.
- 🔍 **Smart Type Detection**: Automatically detects if you need a Frontend, Backend, or Fullstack application.
- ⚡ **Framework Support**: Supports React (Vite), Next.js, and Vue.
- 🎨 **Tailwind CSS Ready**: Automatic configuration for Tailwind CSS in frontend projects.
- 🛠 **Backend Setup**: Ready-to-use Express, Mongoose, and Dotenv setup.
- 📘 **TypeScript Support**: Intelligent detection of TypeScript requirements.

## Installation

Install the package globally via npm:

```bash
npm install -g boil-gen
```

## Usage

Run the CLI with a prompt describing your project:

```bash
boil-gen "build a fullstack app for a library management system"
```

Or for specific needs:

```bash
# Frontend only
boil-gen "create a portfolio website using React"

# Backend only
boil-gen "build a REST API for a todo app"
```

## License

ISC
