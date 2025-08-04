// Tennis Reservation CRUD API - All comments and routes in English

import express from "express";
import fs from "fs/promises";
import { spawn } from "child_process";
import path from "path";
import crypto from "crypto";
import { startScheduler } from "./scheduler.js";
import { executeReservation } from "./runner.js";

const app = express(); // Must be initialized BEFORE any route
app.use(express.json());

// Store active child processes and SSE clients
const activeRuns = new Map();
const sseClients = new Map();

const RESERVATIONS_PATH = path.resolve("./data/reservations.json");

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

// --- CRUD API for Reservations ---
app.get("/api/reservations", async (req, res) => {
  try {
    const reservations = await readReservations();
    res.json(reservations);
  } catch (err) {
    res.status(500).json({ error: "Failed to read reservations." });
  }
});

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

app.post("/api/reservations", async (req, res) => {
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

app.put("/api/reservations/:id", async (req, res) => {
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

app.delete("/api/reservations/:id", async (req, res) => {
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
app.use(express.static("."));

// Endpoint for the client to connect for live log streaming
app.get('/api/run-stream/:runId', (req, res) => {
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
app.post("/run-action", async (req, res) => {
    try {
        const config = req.body;
        const runId = config.reservationId;

        if (!runId) {
            return res.status(400).json({ success: false, error: "Missing reservationId" });
        }

        // Immediately respond to the client so it can connect to the SSE stream
        res.status(202).json({ success: true, runId });

        console.log(`[RUN-ACTION] Starting for runId: ${runId}`);

        // Define the onLog callback to stream data to the SSE client
        const onLog = (log) => {
            const client = sseClients.get(runId);
            if (client) {
                const lines = log.toString().trim().split('\n');
                for (const line of lines) {
                    client.write(`data: ${JSON.stringify({ type: 'log', message: line })}\n\n`);
                }
            }
        };

        // Execute the reservation and wait for the result, passing the activeRuns map for cancellation tracking
        const result = await executeReservation(config, activeRuns, onLog);

        // When done, send the final result and close the SSE connection
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
        res.status(500).json({ success: false, error: err.message || String(err) });
    }
});

// Endpoint to cancel a running reservation process
app.post("/api/cancel-run/:id", (req, res) => {
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

app.listen(PORT, () => {
    console.log(`Backend tennis configurateur listening on http://localhost:${PORT}/`);
    // Start the reservation scheduler
    startScheduler();
});
