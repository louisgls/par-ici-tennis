import express from "express";
import fs from "fs/promises";
import { spawn } from "child_process";
import path from "path";

// Config
const PORT = 3001;
const CONFIG_PATH = path.resolve("./config.json");
const INDEXJS_PATH = path.resolve("./index.js");

const app = express();
app.use(express.json());

// Sert tous les fichiers statiques de la racine (ex : config-editor.html)
app.use(express.static("."));

// Endpoint pour recevoir la config et déclencher l'action
app.post("/run-action", async (req, res) => {
  try {
    const config = req.body;
    // Sauvegarde la config
    await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");

    // Lance node index.js et stream la sortie
    const child = spawn("node", [INDEXJS_PATH], { cwd: process.cwd() });

    let output = "";
    let error = "";
    child.stdout.on("data", (data) => { output += data.toString(); });
    child.stderr.on("data", (data) => { error += data.toString(); });

    child.on("close", (code) => {
      res.json({
        success: code === 0,
        output: output.trim(),
        error: error.trim(),
        exitCode: code
      });
    });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, error: err.message || String(err) });
  }
});

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`Backend tennis configurateur listening on http://localhost:${PORT}/`);
});
