import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

const CONFIG_PATH = path.resolve("./config.json");
const INDEXJS_PATH = path.resolve("./index.js");

/**
 * Executes the tennis reservation script with a given configuration.
 * @param {object} config The configuration object for the reservation.
 * @param {Map} activeRunsMap A map to store the active child process.
 * @param {function(string)} onLog Callback function for real-time log data.
 * @returns {Promise<{success: boolean, output: string, error: string, exitCode: number}>} A promise that resolves with the execution result.
 */
export function executeReservation(config, activeRunsMap, onLog = () => {}) {
    return new Promise(async (resolve, reject) => {
        try {
            await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");

            const child = spawn("node", [INDEXJS_PATH, "--no-close"], { cwd: process.cwd(), stdio: "pipe" });

            // Store the running process for cancellation
            const runId = config.reservationId;
            if (runId) {
                activeRunsMap.set(runId, child);
            }

            let output = "";
            let error = "";
            let foundSuccess = false;

            child.stdout.on("data", (data) => {
                const text = data.toString();
                output += text;
                onLog(text); // Stream log data
                if (/RESERVATION SUCCESS/.test(text)) {
                    foundSuccess = true;
                }
            });

            child.stderr.on("data", (data) => {
                const text = data.toString();
                error += text;
                onLog(text); // Stream error data
            });

            child.on("close", (code) => {
                // Clean up from the map
                if (runId) {
                    activeRunsMap.delete(runId);
                }
                resolve({
                    success: code === 0 && foundSuccess,
                    output,
                    error,
                    exitCode: code,
                });
            });

            child.on("error", (err) => {
                reject(err);
            });

        } catch (err) {
            reject(err);
        }
    });
}
