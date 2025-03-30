#!/usr/bin/env node

console.log('[CLI DEBUG] Raw process.argv:', JSON.stringify(process.argv)); // Keep debug log

// Import functions directly from src/index.js
const { start, runInit } = require('./src/index');

const args = process.argv.slice(2);
const command = args[0];

async function main() {
    if (command === 'init') {
        console.log("Executing 'init' command...");
        try {
            // runInit is likely defined in config-loader, but exposed via index.js
            await runInit();
        } catch (error) {
             console.error("Initialization failed:", error);
             process.exit(1);
        }
    } else if (command === 'start') {
        console.log("Executing 'start' command...");
        try {
            start(); // Call the main start logic from index
        } catch (error) {
             console.error("Failed to start:", error);
             process.exit(1);
        }
        // Keep the process running for the interval timer in start()
    } else {
        console.log(`Unknown command: ${command || 'No command provided'}`);
        console.log("Usage: npx auto-committer [init|start]");
        process.exit(1);
    }
}

main().catch(error => {
    // Catch any unhandled promise rejections from main async functions
    console.error("An unexpected error occurred:", error);
    process.exit(1);
});