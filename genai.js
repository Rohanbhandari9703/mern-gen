import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

const SYSTEM_PROMPT = `
You are a software architect.

Generate a VERY SIMPLE project architecture for a MERN stack app.

STRICT RULES:
- Output ONLY valid JSON
- No markdown, no explanations
- No duplicate keys
- No trailing commas
- Use only the schema below
- All paths must include extensions
- Use npm-compatible dependency names only

JSON SCHEMA (FOLLOW EXACTLY):

{
  "projectName": "string",
  "frontend": {
    "dependencies": ["string"],
    "folders": ["string"],
    "files": ["string"]
  },
  "backend": {
    "dependencies": ["string"],
    "folders": ["string"],
    "files": ["string"]
  }
}
`;

export async function generateArchitecture(userPrompt) {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `${SYSTEM_PROMPT}\n\nUSER REQUEST:\n"${userPrompt}"`
          }
        ]
      }
    ]
  });

  const text = response.text;

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error("gemini returned invalid json");
  }

  return parsed;
}

/* -------- simple test -------- */
if (process.argv[1] === new URL(import.meta.url).pathname) {
  generateArchitecture("create a basic ecommerce website")
    .then(res => {
      console.log("✅ gemini output:");
      console.log(JSON.stringify(res, null, 2));
    })
    .catch(err => {
      console.error("❌ error:", err.message);
    });
}
