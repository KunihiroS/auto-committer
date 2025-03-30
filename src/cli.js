#!/usr/bin/env node

// This file handles command-line argument parsing and execution.
const { start, runInit } = require('./index'); // Import functions from index

const args = process.argv.slice(2);
const command = args[0];

async function main() {
    if (command === 'init') {
        console.log("Executing 'init' command...");
        try {
            await runInit(); // Call the init logic from config-loader via index
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
        console.log("Usage: npx auto-commiter [init|start]");
        process.exit(1);
    }
}

main().catch(error => {
    // Catch any unhandled promise rejections from main async functions
    console.error("An unexpected error occurred:", error);
    process.exit(1);
});