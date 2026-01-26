import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
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

function deduplicate(arr) {
    return [...new Set(arr)];
}

app.post("/generate", async (req, res) => {
    try {
        const { prompt } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: "Prompt is required" });
        }

        const projectType = detectProjectType(prompt);

        // Select model logic (could be made configurable)
        const models = ["gemini-3-flash-preview", "gemini-1.5-flash"];

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
- Backend should include server entry point (index.js or index.ts) in the ROOT of the backend folder, NOT in src/.
- DO NOT include "frontend" or "backend" in folder/file paths (they are already in frontend/backend directories)
- If projectType is "frontend", backend object should be: {"files": [], "folders": [], "dependencies": [], "devDependencies": []}
- If projectType is "backend", frontend object should be: {"files": [], "folders": [], "dependencies": [], "devDependencies": []}
- RESPECT the user's language preference (JavaScript vs TypeScript) from the prompt.
- IF TypeScript is requested:
  - File extensions MUST be .ts or .tsx (except config files).
  - Include "typescript", "@types/node", etc. in devDependencies.
- IF JavaScript is requested (or default):
  - File extensions MUST be .js or .jsx.
  - DO NOT include "typescript" in dependencies.
- Ensure consistency: Don't mix .ts files with no typescript dependency, or .js files with typescript dependency.

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
    "files": ["string (relative paths with extensions, NO 'backend/' prefix. Entry point must be here)"]
  },
  "rootFiles": ["string (files in project root)"],
  "scripts": {
    "install": "string",
    "start": "string",
    "dev": "string"
  }
}`;

        const retries = 3;
        let finalError;

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

                if (!text) throw new Error("No text content in AI response");

                let parsed = extractJSON(text);
                if (!parsed) {
                    try {
                        parsed = JSON.parse(text);
                    } catch (e) {
                        if (i < retries - 1) continue;
                        throw new Error("Failed to extract valid JSON from AI response");
                    }
                }

                if (!parsed.projectName) throw new Error("Invalid architecture: missing projectName");

                // Sanitize response before sending back
                if (projectType === "frontend") {
                    parsed.backend = { files: [], folders: [], dependencies: [], devDependencies: [] };
                    if (!parsed.frontend) parsed.frontend = { files: [], folders: [], dependencies: [], devDependencies: [] };
                } else if (projectType === "backend") {
                    parsed.frontend = { files: [], folders: [], dependencies: [], devDependencies: [] };
                    if (!parsed.backend) parsed.backend = { files: [], folders: [], dependencies: [], devDependencies: [] };
                } else {
                    if (!parsed.frontend) parsed.frontend = { files: [], folders: [], dependencies: [], devDependencies: [] };
                    if (!parsed.backend) parsed.backend = { files: [], folders: [], dependencies: [], devDependencies: [] };
                }

                parsed.frontend.files = deduplicate(parsed.frontend.files || []).filter(f => !f.startsWith("frontend/"));
                parsed.backend.files = deduplicate(parsed.backend.files || []).filter(f => !f.startsWith("backend/"));
                parsed.frontend.folders = deduplicate(parsed.frontend.folders || []).filter(f => !f.startsWith("frontend/"));
                parsed.backend.folders = deduplicate(parsed.backend.folders || []).filter(f => !f.startsWith("backend/"));
                parsed.rootFiles = deduplicate(parsed.rootFiles || []);
                parsed.frontend.dependencies = deduplicate(parsed.frontend.dependencies || []);
                parsed.backend.dependencies = deduplicate(parsed.backend.dependencies || []);
                parsed.frontend.devDependencies = deduplicate(parsed.frontend.devDependencies || []);
                parsed.backend.devDependencies = deduplicate(parsed.backend.devDependencies || []);

                return res.json({ success: true, data: parsed, projectType });
            } catch (err) {
                console.error(`Attempt ${i + 1} failed:`, err.message);
                finalError = err;
                // Wait briefly before retry
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        throw finalError || new Error("AI Generation failed");

    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get("/", (req, res) => {
    res.send("Mern Gen Proxy is Running");
});

app.listen(PORT, () => {
    console.log(`Proxy server running on port ${PORT}`);
});
