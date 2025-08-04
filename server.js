// Tennis Reservation CRUD API - All comments and routes in English

import express from "express";
import fs from "fs/promises";
import { spawn } from "child_process";
import path from "path";
import crypto from "crypto";
import { startScheduler } from "./scheduler.js";
import { executeReservation } from "./runner.js";

const app = express();
const mainRouter = express.Router(); // Create a main router

app.use(express.json());

// Store active child processes and SSE clients
const activeRuns = new Map();
const sseClients = new Map();

const RESERVATIONS_PATH = path.resolve("./data/reservations.json");
const CONFIG_PATH = path.resolve("./config.json");
const INDEXJS_PATH = path.resolve("./index.js");

// Utility to generate unique ID for each reservation
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// Read reservations from file
async function readReservations() {
  const data = await fs.readFile(RESERVATIONS_PATH, "utf8");
  return JSON.parse(data);
}

// Write reservations to file
async function writeReservations(reservations) {
  await fs.writeFile(RESERVATIONS_PATH, JSON.stringify(reservations, null, 2));
}

// --- Attach all routes to the mainRouter ---

// --- CRUD API for Reservations ---
mainRouter.get("/api/reservations", async (req, res) => {
  try {
    const reservations = await readReservations();
    res.json(reservations);
  } catch (err) {
    res.status(500).json({ error: "Failed to read reservations." });
  }
});

mainRouter.get("/api/reservations/:id", async (req, res) => {
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

mainRouter.post("/api/reservations", async (req, res) => {
  try {
    const data = req.body;
    if (!data.date || !data.hour || !data.location || !data.priceType || !data.courtType || !Array.isArray(data.players)) {
      return res.status(400).json({ error: "Missing required reservation fields." });
    }
    const newReservation = { ...data, id: generateId(), status: data.status || "pending" };
    const reservations = await readReservations();
    reservations.push(newReservation);
    await writeReservations(reservations);
    console.log(`[POST] Reservation created: id=${newReservation.id}`);
    res.status(201).json(newReservation);
  } catch (err) {
    res.status(500).json({ error: "Failed to create reservation." });
  }
});

mainRouter.put("/api/reservations/:id", async (req, res) => {
  try {
    const reservations = await readReservations();
    const index = reservations.findIndex(r => r.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Reservation not found." });
    reservations[index] = { ...reservations[index], ...req.body, id: reservations[index].id };
    await writeReservations(reservations);
    console.log(`[PUT] Reservation updated: id=${reservations[index].id}`);
    res.json(reservations[index]);
  } catch (err) {
    res.status(500).json({ error: "Failed to update reservation." });
  }
});

mainRouter.delete("/api/reservations/:id", async (req, res) => {
  try {
    const reservations = await readReservations();
    const index = reservations.findIndex(r => r.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: "Reservation not found." });
    const deleted = reservations.splice(index, 1)[0];
    await writeReservations(reservations);
    console.log(`[DELETE] Reservation deleted: id=${deleted.id}`);
    res.json({ message: "Reservation deleted.", reservation: deleted });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete reservation." });
  }
});

// --- Real-time Logging and Execution API ---

const PORT = 3001;

// Serve static files from the root of the router
mainRouter.use(express.static("."));

// Dynamically serve the frontend configuration
mainRouter.get('/app-config.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    const basePath = process.env.APP_BASE_PATH || '';
    res.send(`
        window.APP_CONFIG = {
            BASE_PATH: '${basePath}'
        };
    `);
});

// Endpoint for the client to connect for live log streaming
mainRouter.get('/api/run-stream/:runId', (req, res) => {
    const { runId } = req.params;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    sseClients.set(runId, res);
    console.log(`[SSE] Client connected for runId: ${runId}`);

    res.write(`data: ${JSON.stringify({ type: 'event', message: 'Live log stream connected.' })}\n\n`);

    req.on('close', () => {
        sseClients.delete(runId);
        console.log(`[SSE] Client disconnected for runId: ${runId}`);
    });
});

// Endpoint to start the reservation process, now using the runner
mainRouter.post("/run-action", async (req, res) => {
    try {
        const config = req.body;
        const runId = config.reservationId;

        if (!runId) {
            return res.status(400).json({ success: false, error: "Missing reservationId" });
        }

        res.status(202).json({ success: true, runId });

        console.log(`[RUN-ACTION] Starting for runId: ${runId}`);

        const onLog = (log) => {
            const client = sseClients.get(runId);
            if (client) {
                const lines = log.toString().trim().split('\n');
                for (const line of lines) {
                    client.write(`data: ${JSON.stringify({ type: 'log', message: line })}\n\n`);
                }
            }
        };

        const result = await executeReservation(config, activeRuns, onLog);

        const client = sseClients.get(runId);
        if (client) {
            console.log(`[RUN-ACTION] Finished for runId: ${runId} with code ${result.exitCode}`);
            client.write(`data: ${JSON.stringify({ type: 'result', success: result.success, exitCode: result.exitCode })}\n\n`);
            client.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
            client.end();
        }
        sseClients.delete(runId);

    } catch (err) {
        // This will catch errors in the initial setup, not in the async runner
        // We don't send a response here because one has already been sent (status 202)
        console.error(`[RUN-ACTION] Error starting process for runId ${req.body.reservationId}:`, err);
    }
});

// Endpoint to cancel a running reservation process
mainRouter.post("/api/cancel-run/:id", (req, res) => {
    const { id } = req.params;
    const child = activeRuns.get(id);

    if (child) {
        console.log(`[CANCEL-RUN] Terminating process for runId: ${id}`);
        child.kill("SIGTERM");
        activeRuns.delete(id);

        const sseClient = sseClients.get(id);
        if (sseClient) {
            sseClient.write(`data: ${JSON.stringify({ type: 'event', message: 'Process cancelled by user.' })}\n\n`);
            sseClient.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
            sseClient.end();
            sseClients.delete(id);
        }
        res.json({ success: true, message: "Process termination signal sent." });
    } else {
        res.status(404).json({ success: false, message: "No active run found." });
    }
});

// Mount the main router under the configurable base path
const basePath = process.env.APP_BASE_PATH || '/';
app.use(basePath, mainRouter);

app.listen(PORT, () => {
    console.log(`Backend tennis configurateur listening on http://localhost:${PORT}${basePath}`);
    // Start the reservation scheduler
    startScheduler();
});
