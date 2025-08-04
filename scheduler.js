import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';
import { executeReservation } from './runner.js';

const RESERVATIONS_PATH = path.resolve("./data/reservations.json");
const API_URL = 'http://localhost:3001';

// Function to read all reservations from the JSON file
async function getReservations() {
    try {
        const data = await fs.readFile(RESERVATIONS_PATH, "utf8");
        return JSON.parse(data);
    } catch (error) {
        console.error('[Scheduler] Error reading reservations file:', error);
        return [];
    }
}

// Function to update the status of a specific reservation
async function updateReservationStatus(id, status) {
    try {
        await fetch(`${API_URL}/api/reservations/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
        });
    } catch (error) {
        console.error(`[Scheduler] Error updating status for reservation ${id}:`, error);
    }
}

// Function to trigger the reservation run action
async function triggerReservation(reservation) {
    console.log(`[Scheduler] Triggering reservation: ${reservation.id} for ${reservation.location} at ${reservation.hour}:00`);

    // First, mark the reservation as "started" to prevent re-triggering
    await updateReservationStatus(reservation.id, 'started');

    const payload = {
        reservationId: reservation.id,
        account: reservation.account,
        locations: [reservation.location],
        date: reservation.date,
        hours: [reservation.hour],
        priceType: [reservation.priceType],
        courtType: [reservation.courtType],
        players: reservation.players,
    };

    try {
        console.log(`[Scheduler] Executing reservation run for ${reservation.id}`);
        // Scheduled runs are not cancellable via API, so we pass a dummy map.
        const dummyActiveRunsMap = new Map();
        const result = await executeReservation(payload, dummyActiveRunsMap, (log) => {
            // We can log scheduler-initiated runs to the main console if desired
            // console.log(`[RUNNER:${reservation.id}] ${log.trim()}`);
        });

        const finalStatus = result.success ? 'ok' : 'failed';
        console.log(`[Scheduler] Reservation ${reservation.id} finished with status: ${finalStatus}`);
        await updateReservationStatus(reservation.id, finalStatus);

    } catch (error) {
        console.error(`[Scheduler] Critical error executing reservation ${reservation.id}:`, error);
        await updateReservationStatus(reservation.id, 'failed');
    }
}

// The main ticker function that runs every minute
async function checkScheduledReservations() {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    console.log(`[Scheduler] Ticker running at ${currentTime}...`);

    const allReservations = await getReservations();
    const pendingReservations = allReservations.filter(r => r.status === 'pending');

    if (pendingReservations.length === 0) {
        console.log('[Scheduler] No pending reservations to check.');
        return;
    }

    for (const reservation of pendingReservations) {
        if (reservation.planTime === currentTime) {
            await triggerReservation(reservation);
        }
    }
}

// Function to start the scheduler
export function startScheduler() {
    console.log('[Scheduler] Starting scheduler, ticker will run every 5 seconds.');
    // Run once on start, then every 60 seconds
    checkScheduledReservations();
    setInterval(checkScheduledReservations, 5000);
}
