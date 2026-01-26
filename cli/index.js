#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);



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

function detectLanguageFromPrompt(prompt) {
  const lowerPrompt = prompt.toLowerCase();
  if (lowerPrompt.includes("typescript") || lowerPrompt.includes("ts")) {
    return "typescript";
  }
  return "javascript";
}

function generateFileContent(filePath, arch, projectName, language = "javascript") {
  const ext = path.extname(filePath).toLowerCase();
  const name = path.basename(filePath, ext);
  const dir = path.dirname(filePath);

  if (ext === ".json") {
    if (name === "package") {
      // Determine if this is backend or frontend
      const isBackend = filePath.includes("backend");

      if (isBackend) {
        // Backend package.json
        return JSON.stringify({
          name: projectName.toLowerCase().replace(/\s+/g, "-"),
          version: "1.0.0",
          type: "module",
          scripts: {
            start: language === "typescript" ? "node dist/index.js" : "node index.js",
            dev: language === "typescript" ? "nodemon --exec tsx index.ts" : "nodemon index.js"
          },
          dependencies: {
            "cors": "^2.8.5",
            "dotenv": "^17.2.3",
            "express": "^5.2.1",
            "helmet": "^8.1.0",
            "mongoose": "^9.1.5",
            "morgan": "^1.10.1"
          },
          devDependencies: language === "typescript" ? {
            "@types/cors": "^2.8.19",
            "@types/express": "^5.0.6",
            "@types/morgan": "^1.9.10",
            "@types/node": "^25.0.9",
            "nodemon": "^3.1.11",
            "tsx": "^4.10.0",
            "typescript": "^5.9.3"
          } : {
            "nodemon": "^3.1.11"
          }
        }, null, 2);
      } else {
        // Frontend package.json
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
    if (name === "index" || name === "main" || name === "app" || name === "server") {
      if (dir.includes("backend") || dir.includes("server")) {
        return `${language === "typescript" ? "import express from 'express';" : "import express from 'express';"}
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'API is running', project: '${projectName}' });
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
    return `${language === "typescript" ? "// " : "// "}${name}${ext}\nexport default function ${name}() {\n  return null;\n}`;
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
  // Use localhost for development, but this should be configured or environment variable driven
  // For the final npm package, this URL should point to the deployed proxy server.
  const API_URL = process.env.MERN_GEN_PROXY_URL || "http://localhost:5001/generate";

  console.log(`🌐 Connecting to AI Server at ${API_URL}...`);

  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Unknown error from server");
      }

      return data.data;

    } catch (error) {
      if (i === retries - 1) throw error;
      console.warn(`⚠️  Connection failed (attempt ${i + 1}/${retries}). Retrying...`);
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

    // Step 1: Install Tailwind CSS and Vite plugin
    console.log("📦 Installing tailwindcss and @tailwindcss/vite...");
    execSync("npm install tailwindcss @tailwindcss/vite", {
      cwd: frontendPath,
      stdio: "inherit"
    });

    // Step 2: Configure the Vite plugin - handle both vite.config.ts and vite.config.js
    let viteConfigPath = path.join(frontendPath, "vite.config.ts");
    let isTypeScript = true;

    if (!fs.existsSync(viteConfigPath)) {
      viteConfigPath = path.join(frontendPath, "vite.config.js");
      isTypeScript = false;
    }

    let viteConfigContent = "";

    if (fs.existsSync(viteConfigPath)) {
      // Update existing vite.config
      viteConfigContent = fs.readFileSync(viteConfigPath, "utf-8");
      if (!viteConfigContent.includes("@tailwindcss/vite")) {
        // Add import if not present
        if (!viteConfigContent.includes("import tailwindcss from '@tailwindcss/vite'")) {
          if (viteConfigContent.includes("import react from '@vitejs/plugin-react'")) {
            viteConfigContent = viteConfigContent.replace(
              "import react from '@vitejs/plugin-react'",
              "import react from '@vitejs/plugin-react'\nimport tailwindcss from '@tailwindcss/vite'"
            );
          } else {
            viteConfigContent = viteConfigContent.replace(
              /import { defineConfig } from ['"]vite['"]/,
              "import { defineConfig } from 'vite'\nimport tailwindcss from '@tailwindcss/vite'"
            );
          }
        }
        // Add plugin to plugins array - handle different formats
        if (viteConfigContent.includes("plugins: [react()]")) {
          viteConfigContent = viteConfigContent.replace(
            "plugins: [react()]",
            "plugins: [tailwindcss(), react()]"
          );
        } else if (viteConfigContent.includes("plugins: [")) {
          viteConfigContent = viteConfigContent.replace(
            /plugins:\s*\[\s*react\(\)/,
            "plugins: [\n    tailwindcss(),\n    react()"
          );
        }
        fs.writeFileSync(viteConfigPath, viteConfigContent);
        console.log(`✅ Updated ${isTypeScript ? 'vite.config.ts' : 'vite.config.js'} with Tailwind plugin`);
      } else {
        console.log(`✅ ${isTypeScript ? 'vite.config.ts' : 'vite.config.js'} already has Tailwind plugin`);
      }
    } else {
      // Create new vite.config.ts with React and Tailwind
      viteConfigPath = path.join(frontendPath, "vite.config.ts");
      viteConfigContent = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
  ],
})`;
      createFile(viteConfigPath, viteConfigContent);
      console.log("✅ Created vite.config.ts with Tailwind plugin");
    }

    // Step 3: Add @import to CSS file
    const cssFiles = ["src/index.css", "src/main.css", "src/App.css", "index.css", "main.css"];
    let cssFileFound = false;

    for (const cssFile of cssFiles) {
      const fullCssPath = path.join(frontendPath, cssFile);
      if (fs.existsSync(fullCssPath)) {
        let cssContent = fs.readFileSync(fullCssPath, "utf-8");
        if (!cssContent.includes('@import "tailwindcss"')) {
          cssContent = `@import "tailwindcss";\n\n${cssContent}`;
          fs.writeFileSync(fullCssPath, cssContent);
          cssFileFound = true;
          console.log(`✅ Added Tailwind import to ${cssFile}`);
          break;
        } else {
          cssFileFound = true;
          console.log(`✅ Tailwind import already present in ${cssFile}`);
          break;
        }
      }
    }

    // If no CSS file found, create one
    if (!cssFileFound) {
      const newCssPath = path.join(frontendPath, "src", "index.css");
      createDirectory(path.dirname(newCssPath));
      createFile(newCssPath, `@import "tailwindcss";\n`);
      console.log("✅ Created new src/index.css with Tailwind import");
    }

    // Ensure postcss.config.js is removed if it was created
    const postcssPath = path.join(frontendPath, "postcss.config.js");
    if (fs.existsSync(postcssPath)) {
      fs.unlinkSync(postcssPath);
      console.log("🗑️  Removed auto-generated postcss.config.js");
    }

    console.log("✅ Tailwind CSS configured successfully!");
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

function setupFramework(basePath, framework, projectName, language) {
  try {
    if (framework === "react" || framework === "vite") {
      const template = language === "typescript" ? "react-ts" : "react";
      execSync(`npm create vite@latest . -- --template ${template}`, {
        cwd: basePath,
        env: { ...process.env, CI: "true" },
        stdio: "pipe"
      });
      fixNestedFolders(basePath);
    } else if (framework === "next") {
      const tsFlag = language === "typescript" ? "--typescript" : "--typescript=false";
      execSync(`npx create-next-app@latest . --yes ${tsFlag} --eslint=false --tailwind=false --app=false`, {
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

  // Infer language from the generated architecture
  let language = "javascript";
  const allDevDeps = [...(arch.frontend.devDependencies || []), ...(arch.backend.devDependencies || [])];
  const allFiles = [...(arch.frontend.files || []), ...(arch.backend.files || [])];

  if (allDevDeps.some(d => d.includes("typescript")) || allFiles.some(f => f.endsWith(".ts") || f.endsWith(".tsx"))) {
    language = "typescript";
  }

  console.log(`✅ Architecture generated. Using ${language === "typescript" ? "TypeScript" : "JavaScript"} based on AI decision.`);

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
    const content = generateFileContent(filePath, arch, projectName, language);
    createFile(filePath, content);
  }

  const hasFrontend = arch.frontend && (arch.frontend.files?.length > 0 || arch.frontend.folders?.length > 0 || arch.frontend.framework);
  const hasBackend = arch.backend && (arch.backend.files?.length > 0 || arch.backend.folders?.length > 0 || arch.backend.framework);

  if (hasFrontend) {
    console.log("⚛️  Setting up frontend...");
    const frontendPath = path.join(projectPath, "frontend");
    createDirectory(frontendPath);

    if (arch.frontend.framework) {
      setupFramework(frontendPath, arch.frontend.framework, projectName, language);
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
        const content = generateFileContent(fullPath, arch, projectName, language);
        createFile(fullPath, content);
      }
    }

    // Ensure TypeScript dependencies are present if language is TypeScript
    if (language === "typescript") {
      if (!arch.backend.devDependencies) arch.backend.devDependencies = [];
      const requiredDevDeps = ["typescript", "tsx", "@types/node"];

      // Add type definitions for common packages if they are being used
      const allBackendDeps = [...(arch.backend.dependencies || []), ...(arch.backend.devDependencies || [])];
      if (allBackendDeps.some(d => d.includes("express"))) requiredDevDeps.push("@types/express");
      if (allBackendDeps.some(d => d.includes("cors"))) requiredDevDeps.push("@types/cors");
      if (allBackendDeps.some(d => d.includes("mongoose"))) requiredDevDeps.push("@types/mongoose");
      if (allBackendDeps.some(d => d.includes("morgan"))) requiredDevDeps.push("@types/morgan");
      if (allBackendDeps.some(d => d.includes("jsonwebtoken"))) requiredDevDeps.push("@types/jsonwebtoken");
      if (allBackendDeps.some(d => d.includes("bcrypt"))) requiredDevDeps.push("@types/bcryptjs");

      requiredDevDeps.forEach(dep => {
        // Check if dependency is already included (checking by name, ignoring version)
        const isIncluded = arch.backend.devDependencies.some(d => {
          const depName = d.split("@")[0] || d; // Handle versioned deps like "dep@1.0.0" (simple check)
          return d.includes(dep);
        });

        if (!isIncluded) {
          arch.backend.devDependencies.push(dep);
        }
      });

      // Also ensure start/dev scripts are correct in the architecture so they don't get overwritten incorrectly later? 
      // Actually we handle scripts in the final package.json replacement, but adding them to arch helps if we used arch.scripts
    }

    if (arch.backend.dependencies?.length > 0 || arch.backend.devDependencies?.length > 0) {
      console.log("📦 Installing backend dependencies...");
      installDependencies(
        backendPath,
        arch.backend.dependencies || [],
        arch.backend.devDependencies || []
      );
    }

    // Override package.json with our template that has proper scripts
    const backendPackageJsonPath = path.join(backendPath, "package.json");
    if (fs.existsSync(backendPackageJsonPath)) {
      const existingPackage = JSON.parse(fs.readFileSync(backendPackageJsonPath, "utf-8"));
      const updatedPackage = {
        name: existingPackage.name || projectName.toLowerCase().replace(/\s+/g, "-"),
        version: existingPackage.version || "1.0.0",
        description: existingPackage.description || "",
        type: "module",
        main: existingPackage.main || "index.js",
        scripts: {
          start: language === "typescript" ? "node dist/index.js" : "node index.js",
          dev: language === "typescript" ? "nodemon --exec tsx index.ts" : "nodemon index.js"
        },
        keywords: existingPackage.keywords || [],
        author: existingPackage.author || "",
        license: existingPackage.license || "ISC",
        dependencies: existingPackage.dependencies || {},
        devDependencies: {
          ...(existingPackage.devDependencies || {}),
          ...(language === "typescript" ? {
            "nodemon": "^3.1.11",
            "tsx": "^4.10.0"
          } : {
            "nodemon": "^3.1.11"
          })
        }
      };

      fs.writeFileSync(backendPackageJsonPath, JSON.stringify(updatedPackage, null, 2));
      console.log("✅ Backend package.json configured with proper scripts");
    }
  }

  console.log("✅ Project generated successfully!");
  console.log(`\n📂 Project location: ${projectPath}`);
  console.log("\n🚀 Next steps:");
  if (hasFrontend) {
    console.log(`   cd ${projectName}/frontend \n npm run dev`);
  }
  if (hasBackend) {
    console.log(`   cd ${projectName}/backend \n npm start`);
  }
  if (!hasFrontend && !hasBackend) {
    console.log(`   cd ${projectName} \n npm install`);
  }
}

generateProject().catch(error => {
  console.error("❌ Fatal error:", error.message);
  process.exit(1);
});
