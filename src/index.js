const configLoader = require('./config-loader');
const gitHandler = require('./git-handler');
const llmService = require('./llm-service');

console.log("Auto Committer main logic loaded.");

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
    process.stdout.write("Running auto commit cycle...        \n");

    let commitOccurred = false; // Flag to track if a commit actually happened

    try {
        // config is loaded at start, reload if needed: config = configLoader.loadConfig();

        // 1. Stage changes
        await gitHandler.stageChanges();

        // 2. Get diff
        const diff = await gitHandler.getDiff();
        if (!diff || diff.trim() === '') {
            console.log("No changes to commit in this cycle.");
            // No commit occurred
        } else {
            // 3. Generate commit message
            const commitMessageBase = await llmService.generateCommitMessage(diff, config.llm);
            const commitMessage = `${config.commitPrefix} ${commitMessageBase.trim()}`;

            // 4. Commit changes
            await gitHandler.commitChanges(commitMessage);
            commitOccurred = true; // Mark that a commit happened
            console.log("Auto commit successful.");

            // 5. Push changes if enabled AND commit occurred
            if (config.autoPush && commitOccurred) {
                console.log("Auto push enabled, attempting push...");
                // Assuming push to origin current branch for now
                await gitHandler.pushChanges('origin'); // Add error handling if needed
            } else if (config.autoPush && !commitOccurred) {
                // This case shouldn't happen if commit logic is correct, but good to note
                console.log("Auto push enabled, but no commit occurred in this cycle.");
            }
        }

    } catch (error) {
        console.error("Commit cycle failed:", error.message); // Log specific error message
    } finally {
        isRunningCycle = false; // Release lock
        console.log("Commit cycle finished.");
    }
}

// Function to start the main interval timer
function startIntervalTimer() {
    if (intervalId) {
        clearInterval(intervalId);
    }

    remainingSeconds = config.commitIntervalSeconds;
    process.stdout.write(`Next auto commit in: ${remainingSeconds}s \r`);

    intervalId = setInterval(async () => {
        remainingSeconds--;
        if (remainingSeconds <= 0) {
            clearInterval(intervalId);
            intervalId = null;

            await handleCommitCycle();

            // Reload config in case interval changed? For now, keep initial config.
            // config = configLoader.loadConfig();
            startIntervalTimer(); // Reset and restart the interval

        } else {
             process.stdout.write(`Next auto commit in: ${remainingSeconds}s \r`);
        }
    }, 1000);
}

// Main start function called by CLI
function start() {
    try {
        config = configLoader.loadConfig(); // Load initial config
        console.log(`Starting Auto Committer. Interval: ${config.commitIntervalSeconds} seconds. AutoPush: ${config.autoPush}`);
        startIntervalTimer();

        const shutdown = () => {
            console.log("\nShutting down Auto Committer...");
            if (intervalId) {
                clearInterval(intervalId);
            }
            process.stdout.write("\n");
            process.exit(0);
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);

    } catch (error) {
         console.error("Failed to start Auto Committer:", error.message);
         process.exit(1);
    }
}

module.exports = {
    start,
    runInit: configLoader.runInit
};