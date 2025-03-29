// Main application logic: orchestrates the different modules.
const configLoader = require('./config-loader');
const fileWatcher = require('./file-watcher');
const gitHandler = require('./git-handler');
const llmService = require('./llm-service');

console.log("Auto Commiter main logic loaded.");

async function handleFileChange() {
    console.log("File change detected, processing...");
    try {
        // 1. Stage changes
        await gitHandler.stageChanges();

        // 2. Get diff
        const diff = await gitHandler.getDiff();
        if (!diff || diff.trim() === '') {
            console.log("No changes to commit.");
            return;
        }

        // 3. Generate commit message
        const config = configLoader.loadConfig(); // Reload config in case it changed? Or load once at start?
        const commitMessageBase = await llmService.generateCommitMessage(diff, config.llm);
        const commitMessage = `${config.commitPrefix} ${commitMessageBase}`;

        // 4. Commit changes
        await gitHandler.commitChanges(commitMessage);

        console.log("Auto commit successful.");
    } catch (error) {
        console.error("Error during auto commit process:", error);
    }
}

function start() {
    const config = configLoader.loadConfig();
    console.log("Starting Auto Commiter...");
    fileWatcher.startWatcher(config.watchPaths, handleFileChange); // Pass the handler function

    // Graceful shutdown handling
    process.on('SIGINT', () => {
        console.log("\nSIGINT received. Stopping watcher...");
        fileWatcher.stopWatcher();
        process.exit(0);
    });
    process.on('SIGTERM', () => {
        console.log("SIGTERM received. Stopping watcher...");
        fileWatcher.stopWatcher();
        process.exit(0);
    });
}

// This module might export the 'start' function if called from cli.js
// Or it might just run 'start()' if this is the main entry point for 'start' command.
// Let's assume cli.js calls start() for now.

module.exports = {
    start,
    // Expose runInit if cli.js needs it
    runInit: configLoader.runInit
};