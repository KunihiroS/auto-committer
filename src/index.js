// Main application logic: orchestrates the different modules.
const configLoader = require('./config-loader');
// const fileWatcher = require('./file-watcher'); // No longer needed
const gitHandler = require('./git-handler');
const llmService = require('./llm-service');

console.log("Auto Commiter main logic loaded.");

// Renamed function for clarity
async function handleCommitCycle() {
    // Use a separate log for the start of the cycle to avoid being overwritten by countdown
    process.stdout.write("Running auto commit cycle...        \n"); // Clear countdown line and add newline
    let config; // Define config here to use in finally block
    try {
        config = configLoader.loadConfig(); // Load config at the start of the cycle
        // 1. Stage changes based on watchPaths
        // Note: gitHandler.stageChanges might need to accept paths or handle it internally
        await gitHandler.stageChanges(); // Assuming it stages based on config or '.'

        // 2. Get diff
        const diff = await gitHandler.getDiff();
        if (!diff || diff.trim() === '') {
            console.log("No changes to commit in this cycle.");
            // No need to update countdown here, main loop will handle it
            return; // Exit cycle if no changes
        }

        // 3. Generate commit message
        // Config already loaded
        const commitMessageBase = await llmService.generateCommitMessage(diff, config.llm);
        const commitMessage = `${config.commitPrefix} ${commitMessageBase.trim()}`; // Trim LLM message

        // 4. Commit changes
        await gitHandler.commitChanges(commitMessage);

        console.log("Auto commit successful.");
    } catch (error) {
        console.error("Error during auto commit cycle:", error);
    } finally {
        // Ensure the next countdown starts correctly, regardless of success/error/no changes
        // The main interval loop will reset remainingSeconds and start the countdown display
        console.log("Commit cycle finished."); // Log cycle end
    }
}


function start() {
    let config = configLoader.loadConfig(); // Load initial config
    let remainingSeconds = config.commitIntervalSeconds;
    let intervalId = null; // To store the interval ID

    console.log(`Starting Auto Commiter. Interval: ${config.commitIntervalSeconds} seconds.`);
    process.stdout.write(`Next auto commit in: ${remainingSeconds}s \r`); // Initial countdown display

    const tick = async () => {
        remainingSeconds--;
        if (remainingSeconds <= 0) {
            // Stop the current interval temporarily to prevent overlap if handleCommitCycle takes long
            if (intervalId) clearInterval(intervalId);
            intervalId = null; // Mark as stopped

            await handleCommitCycle();

            // Reload config in case interval changed
            config = configLoader.loadConfig();
            remainingSeconds = config.commitIntervalSeconds; // Reset timer

            // Restart the interval
            startInterval();

        } else {
             process.stdout.write(`Next auto commit in: ${remainingSeconds}s \r`);
        }
    };

    const startInterval = () => {
        if (intervalId) clearInterval(intervalId); // Clear existing interval if any
        remainingSeconds = config.commitIntervalSeconds; // Ensure reset before starting
         process.stdout.write(`Next auto commit in: ${remainingSeconds}s \r`); // Show immediately
        intervalId = setInterval(tick, 1000); // Start new interval
    };


    // Graceful shutdown handling
    const shutdown = () => {
        console.log("\nShutting down Auto Commiter...");
        if (intervalId) {
            clearInterval(intervalId);
        }
        process.stdout.write("\n"); // Ensure prompt is on a new line after shutdown
        // Add any other cleanup if needed
        process.exit(0);
    };

    process.on('SIGINT', shutdown); // Ctrl+C
    process.on('SIGTERM', shutdown); // Termination signal

    // Start the initial interval
    startInterval();
}

// This module might export the 'start' function if called from cli.js
// Or it might just run 'start()' if this is the main entry point for 'start' command.
// Let's assume cli.js calls start() for now.

module.exports = {
    start,
    // Expose runInit if cli.js needs it
    runInit: configLoader.runInit
};