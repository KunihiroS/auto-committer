const configLoader = require('./config-loader');
const gitHandler = require('./git-handler');
const llmService = require('./llm-service');

console.log("Auto Commiter main logic loaded.");

let intervalId = null; // To store the interval ID
let config = null; // To store loaded config
let remainingSeconds = 0; // To store countdown
let isRunningCycle = false; // Flag to prevent overlapping cycles

// Main commit cycle logic
async function handleCommitCycle() {
    if (isRunningCycle) {
        console.log("Commit cycle already running, skipping this interval.");
        return;
    }
    isRunningCycle = true;
    // Use a separate log for the start of the cycle to avoid being overwritten by countdown
    process.stdout.write("Running auto commit cycle...        \n"); // Clear countdown line and add newline

    try {
        // Config is loaded once at start, but could be reloaded here if needed
        // config = configLoader.loadConfig();

        // 1. Stage changes
        // Assuming stageChanges stages everything within the repo for now.
        // If it needs watchPaths, pass config.watchPaths
        await gitHandler.stageChanges();

        // 2. Get diff
        const diff = await gitHandler.getDiff();
        if (!diff || diff.trim() === '') {
            console.log("No changes to commit in this cycle.");
            isRunningCycle = false; // Release lock
            // No need to update countdown here, main loop will handle it
            return; // Exit cycle if no changes
        }

        // 3. Generate commit message
        const commitMessageBase = await llmService.generateCommitMessage(diff, config.llm);
        const commitMessage = `${config.commitPrefix} ${commitMessageBase.trim()}`;

        // 4. Commit changes
        await gitHandler.commitChanges(commitMessage);

        console.log("Auto commit successful.");

    } catch (error) {
        // Error is already logged in gitHandler or llmService
        console.error("Commit cycle failed.");
    } finally {
        isRunningCycle = false; // Release lock
        console.log("Commit cycle finished.");
        // Countdown reset and display is handled by the main interval loop
    }
}

// Function to start the main interval timer
function startIntervalTimer() {
    if (intervalId) {
        clearInterval(intervalId); // Clear existing interval if any
    }

    remainingSeconds = config.commitIntervalSeconds; // Reset countdown
    process.stdout.write(`Next auto commit in: ${remainingSeconds}s \r`); // Show initial countdown

    intervalId = setInterval(async () => {
        remainingSeconds--;
        if (remainingSeconds <= 0) {
            // Stop timer temporarily while cycle runs
            clearInterval(intervalId);
            intervalId = null;

            await handleCommitCycle();

            // Restart timer after cycle finishes
            // Config could be reloaded here if needed: config = configLoader.loadConfig();
            startIntervalTimer(); // Reset and restart the interval

        } else {
             process.stdout.write(`Next auto commit in: ${remainingSeconds}s \r`);
        }
    }, 1000); // Run every second
}

// Main start function called by CLI
function start() {
    try {
        config = configLoader.loadConfig(); // Load initial config
        console.log(`Starting Auto Commiter. Interval: ${config.commitIntervalSeconds} seconds.`);
        startIntervalTimer(); // Start the interval timer

        // Graceful shutdown handling
        const shutdown = () => {
            console.log("\nShutting down Auto Commiter...");
            if (intervalId) {
                clearInterval(intervalId);
            }
            process.stdout.write("\n"); // Ensure prompt is on a new line
            // Add any other cleanup if needed
            process.exit(0);
        };

        process.on('SIGINT', shutdown); // Ctrl+C
        process.on('SIGTERM', shutdown); // Termination signal

    } catch (error) {
         console.error("Failed to start Auto Commiter:", error.message);
         process.exit(1); // Exit with error code
    }
}

module.exports = {
    start,
    runInit: configLoader.runInit // Expose runInit for cli.js
};