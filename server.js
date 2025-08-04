// Tennis Reservation CRUD API - All comments and routes in English

import express from "express";
import fs from "fs/promises";
import { spawn } from "child_process";
import path from "path";

const app = express(); // Must be initialized BEFORE any route
app.use(express.json());

const RESERVATIONS_PATH = path.resolve("./data/reservations.json");

// Utility to generate unique ID for each reservation
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// Read reservations from file
async function readReservations() {
  const data = await fs.readFile(RESERVATIONS_PATH, "utf8");
  const reservations = JSON.parse(data);
  return reservations;
}

// Write reservations to file
async function writeReservations(reservations) {
  await fs.writeFile(RESERVATIONS_PATH, JSON.stringify(reservations, null, 2));
}

/**
 * @route   GET /api/reservations
 * @desc    Retrieves all reservations
 * @access  Public
 */

// Returns all reservations
app.get("/api/reservations", async (req, res) => {
  try {
    const reservations = await readReservations();
    res.json(reservations);
  } catch (err) {
    res.status(500).json({ error: "Failed to read reservations." });
  }
});

/**
 * @route   GET /api/reservations/:id
 * @desc    Retrieves a reservation by id
 * @access  Public
 */

// Returns a reservation by id
app.get("/api/reservations/:id", async (req, res) => {
  try {
    const reservations = await readReservations();
    const reservation = reservations.find(r => r.id === req.params.id);
    if (reservation) {
      res.json(reservation);
    } else {
      res.status(404).json({ error: "Reservation not found." });
    }
  } catch (err) {
    res.status(500).json({ error: "Failed to read reservations." });
  }
});

/**
 * @route   POST /api/reservations
 * @desc    Creates a new reservation
 * @access  Public
 */

// Creates a new reservation
app.post("/api/reservations", async (req, res) => {
  try {
    const data = req.body;

    // Basic validation (can be extended as needed)
    if (!data.date || !data.hour || !data.location || !data.priceType || !data.courtType || !Array.isArray(data.players)) {
      return res.status(400).json({ error: "Missing required reservation fields." });
    }

    const newReservation = {
      ...data,
      id: generateId(),
      status: data.status || "pending",
    };

    const reservations = await readReservations();
    reservations.push(newReservation);
    await writeReservations(reservations);

// Log to stdout when reservation created
    console.log(`[POST] Reservation created: id=${newReservation.id}, date=${newReservation.date}, hour=${newReservation.hour}, location=${newReservation.location}`);
    res.status(201).json(newReservation);
  } catch (err) {
    res.status(500).json({ error: "Failed to create reservation." });
  }
});

/**
 * @route   PUT /api/reservations/:id
 * @desc    Updates an existing reservation
 * @access  Public
 */

// Updates a reservation by id
app.put("/api/reservations/:id", async (req, res) => {
  try {
    const reservations = await readReservations();
    const index = reservations.findIndex(r => r.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: "Reservation not found." });
    }
    // Merge existing reservation with incoming changes
    reservations[index] = { ...reservations[index], ...req.body, id: reservations[index].id };
    await writeReservations(reservations);
// Log to stdout when reservation updated
    console.log(`[PUT] Reservation updated: id=${reservations[index].id}`);
    res.json(reservations[index]);
  } catch (err) {
    res.status(500).json({ error: "Failed to update reservation." });
  }
});

/**
 * @route   DELETE /api/reservations/:id
 * @desc    Deletes a reservation by id
 * @access  Public
 */

// Deletes a reservation by id
app.delete("/api/reservations/:id", async (req, res) => {
  try {
    const reservations = await readReservations();
    const index = reservations.findIndex(r => r.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: "Reservation not found." });
    }
    const deleted = reservations.splice(index, 1)[0];
    await writeReservations(reservations);
// Log to stdout when reservation deleted
    console.log(`[DELETE] Reservation deleted: id=${deleted.id}`);
    res.json({ message: "Reservation deleted.", reservation: deleted });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete reservation." });
  }
});

// --- END Tennis Reservation API ---

// Config
const PORT = 3001;
const CONFIG_PATH = path.resolve("./config.json");
const INDEXJS_PATH = path.resolve("./index.js");

// Sert tous les fichiers statiques de la racine (ex : config-editor.html)
app.use(express.static("."));

// Endpoint pour recevoir la config et déclencher l'action
app.post("/run-action", async (req, res) => {
  try {
    const config = req.body;
    // Log run-action payload for debug
    console.log("[RUN-ACTION] Config payload received:", JSON.stringify(config, null, 2));
    // Sauvegarde la config
    await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");

    // Launch node index.js with "--no-close" for interactive browser inspection, capture logs for UI feedback
    const child = spawn("node", [INDEXJS_PATH, "--no-close"], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });

    let output = "";
    let error = "";
    let foundSuccess = false;

    // Capture stdout and look for "Réservation faite" for success
    child.stdout.on("data", (data) => {
      const txt = data.toString();
      output += txt;
      if (/Réservation faite/i.test(txt)) {
        foundSuccess = true;
      }
    });

    // Capture stderr as well
    child.stderr.on("data", (data) => {
      const txt = data.toString();
      error += txt;
    });

    // On close, send logs & detected status to client
    child.on("close", (code) => {
      res.json({
        success: code === 0 && foundSuccess,
        output: output,
        error: error,
        exitCode: code,
        detectedSuccess: foundSuccess
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
