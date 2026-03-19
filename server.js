import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// serve static files (including CSS, JS, etc.)
app.use(express.static(__dirname));

// handle root request -> send app.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "app.html"));
});

// proxy for Gemini API
app.post("/proxy/gemini", async (req, res) => {
  try {
    const url=`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${process.env.GOOGLE_API_KEY}`
    const r = await fetch(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
      }
    );
    const data = await r.json();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gemini proxy failed" });
  }
});

app.listen(7860, () => console.log("✅ Server running on port 7860"));


