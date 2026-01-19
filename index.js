#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
});

function extractJSON(text) {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      return null;
    }
  }
  return null;
}

function sanitizePath(p) {
  return p.replace(/[<>:"|?*\x00-\x1f]/g, "").trim();
}

function deduplicate(arr) {
  return [...new Set(arr)];
}

function detectProjectType(prompt) {
  const lowerPrompt = prompt.toLowerCase();
  
  const frontendOnlyKeywords = [
    "frontend only", "frontend-only", "only frontend",
    "client side", "client-side", "client side only",
    "static site", "static website", "landing page",
    "portfolio site", "portfolio website", "personal website",
    "react app", "vue app", "svelte app", "next.js app",
    "spa", "single page application", "ui only", "ui-only"
  ];
  
  const backendOnlyKeywords = [
    "backend only", "backend-only", "only backend",
    "server only", "server-only", "api only", "api-only",
    "rest api", "graphql api", "express api", "fastify api",
    "microservice", "serverless", "lambda function"
  ];
  
  const fullstackKeywords = [
    "fullstack", "full stack", "full-stack",
    "mern", "mean", "mevn", "full stack app",
    "web application", "web app", "complete app",
    "with database", "with api", "with backend"
  ];
  
  for (const keyword of frontendOnlyKeywords) {
    if (lowerPrompt.includes(keyword)) {
      return "frontend";
    }
  }
  
  for (const keyword of backendOnlyKeywords) {
    if (lowerPrompt.includes(keyword)) {
      return "backend";
    }
  }
  
  for (const keyword of fullstackKeywords) {
    if (lowerPrompt.includes(keyword)) {
      return "fullstack";
    }
  }
  
  if (lowerPrompt.includes("frontend") && !lowerPrompt.includes("backend") && !lowerPrompt.includes("api")) {
    return "frontend";
  }
  
  if ((lowerPrompt.includes("backend") || lowerPrompt.includes("api") || lowerPrompt.includes("server")) && 
      !lowerPrompt.includes("frontend") && !lowerPrompt.includes("client")) {
    return "backend";
  }
  
  return "fullstack";
}

function generateFileContent(filePath, arch, projectName) {
  const ext = path.extname(filePath).toLowerCase();
  const name = path.basename(filePath, ext);
  const dir = path.dirname(filePath);
  
  if (ext === ".json") {
    if (name === "package") {
      return JSON.stringify({
        name: projectName.toLowerCase().replace(/\s+/g, "-"),
        version: "1.0.0",
        type: "module",
        scripts: {
          start: "node index.js",
          dev: "node --watch index.js"
        },
        dependencies: {},
        devDependencies: {}
      }, null, 2);
    }
    if (name === "tsconfig") {
      return JSON.stringify({
        compilerOptions: {
          target: "ES2020",
          module: "ESNext",
          lib: ["ES2020"],
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
          moduleResolution: "node",
          resolveJsonModule: true,
          isolatedModules: true,
          noEmit: true
        },
        include: ["src"],
        exclude: ["node_modules"]
      }, null, 2);
    }
    return "{}";
  }
  
  if (ext === ".js" || ext === ".jsx" || ext === ".ts" || ext === ".tsx") {
    if (name === "index" || name === "main" || name === "app") {
      if (dir.includes("backend") || dir.includes("server")) {
        return `import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "API is running", project: "${projectName}" });
});

app.listen(PORT, () => {
  console.log(\`🚀 Server running on http://localhost:\${PORT}\`);
});

export default app;`;
      }
      if (dir.includes("frontend") || dir.includes("client")) {
        return `import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

function App() {
  return (
    <div className="app">
      <h1>${projectName}</h1>
      <p>Welcome to your new project!</p>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);`;
      }
    }
    return `// ${name}${ext}\nexport default function ${name}() {\n  return null;\n}`;
  }
  
  if (ext === ".css") {
    return `* {\n  margin: 0;\n  padding: 0;\n  box-sizing: border-box;\n}\n\nbody {\n  font-family: system-ui, sans-serif;\n}`;
  }
  
  if (ext === ".html") {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${projectName}</title>
</head>
<body>
  <div id="root"></div>
</body>
</html>`;
  }
  
  if (ext === ".env" || name === ".env") {
    return `PORT=5000\nNODE_ENV=development`;
  }
  
  if (ext === ".md") {
    return `# ${projectName}\n\nGenerated by mern-gen\n`;
  }
  
  if (ext === ".gitignore") {
    return `node_modules/\n.env\n.DS_Store\ndist/\nbuild/\n*.log`;
  }
  
  return "";
}

async function callAI(prompt, projectType, retries = 3) {
  const models = ["gemini-2.0-flash-exp", "gemini-1.5-flash", "gemini-1.5-pro"];
  
  let projectTypeInstruction = "";
  if (projectType === "frontend") {
    projectTypeInstruction = "\nIMPORTANT: This is a FRONTEND-ONLY project. Set backend to empty object {} or minimal structure.";
  } else if (projectType === "backend") {
    projectTypeInstruction = "\nIMPORTANT: This is a BACKEND-ONLY project. Set frontend to empty object {} or minimal structure.";
  } else {
    projectTypeInstruction = "\nIMPORTANT: This is a FULLSTACK project. Include both frontend and backend.";
  }
  
  const systemPrompt = `You are an expert software architect. Generate a complete project architecture as JSON.
${projectTypeInstruction}

CRITICAL RULES:
- Output ONLY valid JSON, no markdown, no explanations
- All file paths must include extensions (.js, .jsx, .ts, .tsx, .json, .css, .html, etc.)
- No duplicate file paths or folder paths
- Use standard npm package names only
- Include essential files: package.json, .gitignore, README.md
- Frontend should include index.html if web app
- Backend should include server entry point
- DO NOT include "frontend" or "backend" in folder/file paths (they are already in frontend/backend directories)
- If projectType is "frontend", backend object should be: {"files": [], "folders": [], "dependencies": [], "devDependencies": []}
- If projectType is "backend", frontend object should be: {"files": [], "folders": [], "dependencies": [], "devDependencies": []}

JSON SCHEMA:
{
  "projectName": "string (kebab-case)",
  "description": "string",
  "techStack": {
    "frontend": ["string"],
    "backend": ["string"],
    "database": "string",
    "tools": ["string"]
  },
  "frontend": {
    "framework": "string (react, vue, next, svelte, vanilla, etc.)",
    "dependencies": ["string"],
    "devDependencies": ["string"],
    "folders": ["string (relative paths, NO 'frontend/' prefix)"],
    "files": ["string (relative paths with extensions, NO 'frontend/' prefix)"]
  },
  "backend": {
    "framework": "string (express, fastify, nest, etc.)",
    "dependencies": ["string"],
    "devDependencies": ["string"],
    "folders": ["string (relative paths, NO 'backend/' prefix)"],
    "files": ["string (relative paths with extensions, NO 'backend/' prefix)"]
  },
  "rootFiles": ["string (files in project root)"],
  "scripts": {
    "install": "string",
    "start": "string",
    "dev": "string"
  }
}`;

  for (let i = 0; i < retries; i++) {
    try {
      const model = models[i % models.length];
      const response = await ai.models.generateContent({
        model: model,
        contents: [{
          role: "user",
          parts: [{ text: `${systemPrompt}\n\nUser Request: "${prompt}"\n\nGenerate the architecture JSON now:` }]
        }]
      });
      
      let text = "";
      if (typeof response.text === "string") {
        text = response.text;
      } else if (response.response && typeof response.response.text === "function") {
        text = response.response.text();
      } else if (response.response && typeof response.response.text === "string") {
        text = response.response.text;
      } else if (response.candidates && response.candidates[0]?.content?.parts?.[0]?.text) {
        text = response.candidates[0].content.parts[0].text;
      }
      
      if (!text) {
        if (i < retries - 1) continue;
        throw new Error("No text content in AI response");
      }
      
      let parsed = extractJSON(text);
      
      if (!parsed) {
        try {
          parsed = JSON.parse(text);
        } catch (e) {
          if (i < retries - 1) continue;
          throw new Error("Failed to extract valid JSON from AI response");
        }
      }
      
      if (!parsed.projectName) {
        if (i < retries - 1) continue;
        throw new Error("Invalid architecture: missing projectName");
      }
      
      if (!parsed.frontend) parsed.frontend = { files: [], folders: [], dependencies: [], devDependencies: [] };
      if (!parsed.backend) parsed.backend = { files: [], folders: [], dependencies: [], devDependencies: [] };
      
      parsed.frontend.files = deduplicate(parsed.frontend.files || []).filter(f => !f.startsWith("frontend/"));
      parsed.backend.files = deduplicate(parsed.backend.files || []).filter(f => !f.startsWith("backend/"));
      parsed.frontend.folders = deduplicate(parsed.frontend.folders || []).filter(f => !f.startsWith("frontend/"));
      parsed.backend.folders = deduplicate(parsed.backend.folders || []).filter(f => !f.startsWith("backend/"));
      parsed.rootFiles = deduplicate(parsed.rootFiles || []);
      parsed.frontend.dependencies = deduplicate(parsed.frontend.dependencies || []);
      parsed.backend.dependencies = deduplicate(parsed.backend.dependencies || []);
      parsed.frontend.devDependencies = deduplicate(parsed.frontend.devDependencies || []);
      parsed.backend.devDependencies = deduplicate(parsed.backend.devDependencies || []);
      
      return parsed;
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error("AI call failed after retries");
}

function createDirectory(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  } catch (error) {
    console.warn(`⚠️  Could not create directory ${dirPath}: ${error.message}`);
  }
}

function createFile(filePath, content) {
  try {
    const dir = path.dirname(filePath);
    createDirectory(dir);
    fs.writeFileSync(filePath, content, "utf-8");
  } catch (error) {
    console.warn(`⚠️  Could not create file ${filePath}: ${error.message}`);
  }
}

function installDependencies(basePath, deps, devDeps = []) {
  if (deps.length === 0 && devDeps.length === 0) return;
  
  try {
    if (!fs.existsSync(path.join(basePath, "package.json"))) {
      execSync("npm init -y", { cwd: basePath, stdio: "pipe" });
    }
    
    if (deps.length > 0) {
      execSync(`npm install ${deps.join(" ")}`, {
        cwd: basePath,
        stdio: "inherit"
      });
    }
    
    if (devDeps.length > 0) {
      execSync(`npm install -D ${devDeps.join(" ")}`, {
        cwd: basePath,
        stdio: "inherit"
      });
    }
  } catch (error) {
    console.warn(`⚠️  Dependency installation had issues: ${error.message}`);
  }
}

function setupTailwindCSS(frontendPath) {
  try {
    console.log("🎨 Setting up Tailwind CSS...");
    
    if (!fs.existsSync(path.join(frontendPath, "package.json"))) {
      execSync("npm init -y", { cwd: frontendPath, stdio: "pipe" });
    }
    
    execSync("npm install -D tailwindcss postcss autoprefixer", {
      cwd: frontendPath,
      stdio: "pipe"
    });
    
    execSync("npx tailwindcss init -p", {
      cwd: frontendPath,
      stdio: "pipe"
    });
    
    const tailwindConfig = `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}`;

    const tailwindConfigPath = path.join(frontendPath, "tailwind.config.js");
    if (!fs.existsSync(tailwindConfigPath)) {
      createFile(tailwindConfigPath, tailwindConfig);
    }
    
    const indexCssPath = path.join(frontendPath, "src", "index.css");
    const mainCssPath = path.join(frontendPath, "src", "main.css");
    const appCssPath = path.join(frontendPath, "src", "App.css");
    
    const tailwindDirectives = `@tailwind base;
@tailwind components;
@tailwind utilities;
`;
    
    if (fs.existsSync(indexCssPath)) {
      const existing = fs.readFileSync(indexCssPath, "utf-8");
      if (!existing.includes("@tailwind")) {
        fs.writeFileSync(indexCssPath, tailwindDirectives + "\n" + existing);
      }
    } else if (fs.existsSync(mainCssPath)) {
      const existing = fs.readFileSync(mainCssPath, "utf-8");
      if (!existing.includes("@tailwind")) {
        fs.writeFileSync(mainCssPath, tailwindDirectives + "\n" + existing);
      }
    } else if (fs.existsSync(appCssPath)) {
      const existing = fs.readFileSync(appCssPath, "utf-8");
      if (!existing.includes("@tailwind")) {
        fs.writeFileSync(appCssPath, tailwindDirectives + "\n" + existing);
      }
    } else {
      createFile(indexCssPath, tailwindDirectives);
    }
    
    console.log("✅ Tailwind CSS configured");
  } catch (error) {
    console.warn(`⚠️  Tailwind setup had issues: ${error.message}`);
  }
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const files = fs.readdirSync(src);
    for (const file of files) {
      copyRecursive(path.join(src, file), path.join(dest, file));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function removeRecursive(dirPath) {
  if (fs.existsSync(dirPath)) {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      if (fs.statSync(filePath).isDirectory()) {
        removeRecursive(filePath);
      } else {
        fs.unlinkSync(filePath);
      }
    }
    fs.rmdirSync(dirPath);
  }
}

function fixNestedFolders(basePath) {
  try {
    if (!fs.existsSync(basePath)) return;
    
    const files = fs.readdirSync(basePath);
    for (const file of files) {
      const filePath = path.join(basePath, file);
      if (fs.statSync(filePath).isDirectory() && (file === "frontend" || file === "backend")) {
        const nestedPath = filePath;
        const nestedFiles = fs.readdirSync(nestedPath);
        for (const nestedFile of nestedFiles) {
          if (nestedFile === "node_modules" || nestedFile === ".git") continue;
          const srcPath = path.join(nestedPath, nestedFile);
          const destPath = path.join(basePath, nestedFile);
          if (fs.existsSync(destPath) && fs.statSync(srcPath).isDirectory()) {
            copyRecursive(srcPath, destPath);
          } else if (!fs.existsSync(destPath)) {
            copyRecursive(srcPath, destPath);
          }
        }
        removeRecursive(nestedPath);
        fixNestedFolders(basePath);
      }
    }
  } catch (error) {
    console.warn(`⚠️  Error fixing nested folders: ${error.message}`);
  }
}

function setupFramework(basePath, framework, projectName) {
  try {
    if (framework === "react" || framework === "vite") {
      execSync("npm create vite@latest . -- --template react", {
        cwd: basePath,
        env: { ...process.env, CI: "true" },
        stdio: "pipe"
      });
      fixNestedFolders(basePath);
    } else if (framework === "next") {
      execSync("npx create-next-app@latest . --yes --typescript=false --eslint=false --tailwind=false --app=false", {
        cwd: basePath,
        stdio: "pipe"
      });
      fixNestedFolders(basePath);
    } else if (framework === "vue") {
      execSync("npm create vue@latest . -- --default", {
        cwd: basePath,
        env: { ...process.env, CI: "true" },
        stdio: "pipe"
      });
      fixNestedFolders(basePath);
    }
  } catch (error) {
    console.warn(`⚠️  Framework setup had issues: ${error.message}`);
  }
}

async function generateProject() {
  const userPrompt = process.argv.slice(2).join(" ").trim();
  
  if (!userPrompt) {
    console.error("❌ Please provide a project description");
    console.log("Usage: mern-gen \"build a fullstack app for X\"");
    process.exit(1);
  }
  
  const projectType = detectProjectType(userPrompt);
  console.log(`🤖 Analyzing your request... (Detected: ${projectType === "frontend" ? "Frontend-only" : projectType === "backend" ? "Backend-only" : "Fullstack"})`);
  
  let arch;
  try {
    arch = await callAI(userPrompt, projectType);
  } catch (error) {
    console.error(`❌ Failed to generate architecture: ${error.message}`);
    process.exit(1);
  }
  
  const projectName = sanitizePath(arch.projectName || "my-project");
  const projectPath = path.join(process.cwd(), projectName);
  
  if (fs.existsSync(projectPath)) {
    console.error(`❌ Directory "${projectName}" already exists`);
    process.exit(1);
  }
  
  console.log(`📁 Creating project: ${projectName}`);
  createDirectory(projectPath);
  
  console.log("📂 Setting up project structure...");
  
  const rootFiles = arch.rootFiles || [];
  rootFiles.push("README.md", ".gitignore");
  
  for (const file of deduplicate(rootFiles)) {
    const filePath = path.join(projectPath, sanitizePath(file));
    const content = generateFileContent(filePath, arch, projectName);
    createFile(filePath, content);
  }
  
  const hasFrontend = arch.frontend && (arch.frontend.files?.length > 0 || arch.frontend.folders?.length > 0 || arch.frontend.framework);
  const hasBackend = arch.backend && (arch.backend.files?.length > 0 || arch.backend.folders?.length > 0 || arch.backend.framework);
  
  if (hasFrontend) {
    console.log("⚛️  Setting up frontend...");
    const frontendPath = path.join(projectPath, "frontend");
    createDirectory(frontendPath);
    
    if (arch.frontend.framework) {
      setupFramework(frontendPath, arch.frontend.framework, projectName);
    }
    
    if (!fs.existsSync(path.join(frontendPath, "package.json"))) {
      execSync("npm init -y", { cwd: frontendPath, stdio: "pipe" });
    }
    
    for (const folder of arch.frontend.folders || []) {
      const folderPath = sanitizePath(folder).replace(/^frontend[\\\/]/, "").replace(/^[\\\/]/, "");
      if (folderPath) {
        createDirectory(path.join(frontendPath, folderPath));
      }
    }
    
    for (const file of arch.frontend.files || []) {
      const filePath = sanitizePath(file).replace(/^frontend[\\\/]/, "").replace(/^[\\\/]/, "");
      if (filePath && !fs.existsSync(path.join(frontendPath, filePath))) {
        const fullPath = path.join(frontendPath, filePath);
        const content = generateFileContent(fullPath, arch, projectName);
        createFile(fullPath, content);
      }
    }
    
    if (arch.frontend.dependencies?.length > 0 || arch.frontend.devDependencies?.length > 0) {
      console.log("📦 Installing frontend dependencies...");
      installDependencies(
        frontendPath,
        arch.frontend.dependencies || [],
        arch.frontend.devDependencies || []
      );
    }
    
    setupTailwindCSS(frontendPath);
  }
  
  if (hasBackend) {
    console.log("🔧 Setting up backend...");
    const backendPath = path.join(projectPath, "backend");
    createDirectory(backendPath);
    
    if (!fs.existsSync(path.join(backendPath, "package.json"))) {
      execSync("npm init -y", { cwd: backendPath, stdio: "pipe" });
    }
    
    for (const folder of arch.backend.folders || []) {
      const folderPath = sanitizePath(folder).replace(/^backend[\\\/]/, "").replace(/^[\\\/]/, "");
      if (folderPath) {
        createDirectory(path.join(backendPath, folderPath));
      }
    }
    
    for (const file of arch.backend.files || []) {
      const filePath = sanitizePath(file).replace(/^backend[\\\/]/, "").replace(/^[\\\/]/, "");
      if (filePath && !fs.existsSync(path.join(backendPath, filePath))) {
        const fullPath = path.join(backendPath, filePath);
        const content = generateFileContent(fullPath, arch, projectName);
        createFile(fullPath, content);
      }
    }
    
    if (arch.backend.dependencies?.length > 0 || arch.backend.devDependencies?.length > 0) {
      console.log("📦 Installing backend dependencies...");
      installDependencies(
        backendPath,
        arch.backend.dependencies || [],
        arch.backend.devDependencies || []
      );
    }
  }
  
  console.log("✅ Project generated successfully!");
  console.log(`\n📂 Project location: ${projectPath}`);
  console.log("\n🚀 Next steps:");
  if (hasFrontend) {
    console.log(`   cd ${projectName}/frontend && npm run dev`);
  }
  if (hasBackend) {
    console.log(`   cd ${projectName}/backend && npm start`);
  }
  if (!hasFrontend && !hasBackend) {
    console.log(`   cd ${projectName} && npm install`);
  }
}

generateProject().catch(error => {
  console.error("❌ Fatal error:", error.message);
  process.exit(1);
});
