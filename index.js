#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

// --------------------
// READ PROJECT NAME
// --------------------
const projectName = process.argv[2];

if (!projectName) {
  console.error("❌ Please provide a project name");
  console.log("Usage: install-mern <project-name>");
  process.exit(1);
}

const projectPath = path.join(process.cwd(), projectName);

if (fs.existsSync(projectPath)) {
  console.error("❌ Folder already exists");
  process.exit(1);
}

// --------------------
// CREATE PROJECT ROOT
// --------------------
fs.mkdirSync(projectPath);
console.log("📁 Project folder created");

// --------------------
// CREATE BACKEND STRUCTURE
// --------------------
const folders = [
  "src",
  "src/config",
  "src/controllers",
  "src/routes",
  "src/models",
  "src/middlewares"
];

folders.forEach(folder => {
  fs.mkdirSync(path.join(projectPath, folder), { recursive: true });
});

console.log("📂 Backend folder structure created");

// --------------------
// INIT NPM PROJECT
// --------------------
console.log("📦 Initializing npm project...");
execSync("npm init -y", {
  cwd: projectPath,
  stdio: "inherit"
});

// --------------------
// INSTALL DEPENDENCIES
// --------------------
console.log("📥 Installing dependencies...");
execSync(
  "npm install express mongoose dotenv cors",
  {
    cwd: projectPath,
    stdio: "inherit"
  }
);

execSync(
  "npm install -D nodemon",
  {
    cwd: projectPath,
    stdio: "inherit"
  }
);

// --------------------
// UPDATE package.json
// --------------------
const pkgPath = path.join(projectPath, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

pkg.type = "module";
pkg.scripts = {
  start: "node src/server.js",
  dev: "nodemon src/server.js"
};

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
console.log("🛠 package.json updated");

// --------------------
// WRITE BOILERPLATE FILES
// --------------------

// app.js
const appJs = `
import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("API is running...");
});

export default app;
`;

fs.writeFileSync(path.join(projectPath, "src/app.js"), appJs);

// server.js
const serverJs = `
import app from "./app.js";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected");

    app.listen(PORT, () => {
      console.log(\`🚀 Server is running on port \${PORT}\`);
      console.log(\`🌐 URL: http://localhost:\${PORT}\`);
      console.log("ctrl + C to stop the server");
    });
  })
  .catch(err => {
    console.error("❌ DB connection failed:", err.message);
  });
`;


fs.writeFileSync(path.join(projectPath, "src/server.js"), serverJs);

// .env
const envFile = `
PORT=5000
MONGO_URI=mongodb://localhost:27017/mydb
`;

fs.writeFileSync(path.join(projectPath, ".env"), envFile);

// sample controller
const controller = `
export const sampleController = (req, res) => {
  res.json({ message: "Sample controller working" });
};
`;

fs.writeFileSync(
  path.join(projectPath, "src/controllers/sample.controller.js"),
  controller
);

// sample route
const route = `
import { Router } from "express";
import { sampleController } from "../controllers/sample.controller.js";

const router = Router();

router.get("/sample", sampleController);

export default router;
`;

fs.writeFileSync(
  path.join(projectPath, "src/routes/sample.routes.js"),
  route
);

console.log("✅ MERN backend boilerplate created successfully!");
console.log(`➡️  cd ${projectName}`);
console.log("➡️  npm run dev");
