const { spawn } = require('child_process');
const path = require('path');

console.log("src/git-handler.js loaded");

// Helper function to run git commands
function runGitCommand(args, cwd = process.cwd()) {
    return new Promise((resolve, reject) => {
        const gitProcess = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }); // ignore stdin, pipe stdout/stderr
        let stdoutData = '';
        let stderrData = '';

        gitProcess.stdout.on('data', (data) => {
            stdoutData += data.toString();
        });

        gitProcess.stderr.on('data', (data) => {
            stderrData += data.toString();
        });

        gitProcess.on('close', (code) => {
            if (code === 0) {
                resolve(stdoutData.trim());
            } else {
                // Log stderr for debugging but reject with a cleaner message
                console.error(`Git command "git ${args.join(' ')}" failed with code ${code}`);
                console.error('stderr:', stderrData.trim());
                reject(new Error(`Git command failed: ${stderrData.trim() || `Exit code ${code}`}`));
            }
        });

        gitProcess.on('error', (err) => {
            console.error(`Failed to start git process: ${err}`);
            reject(new Error(`Failed to execute git command: ${err.message}`));
        });
    });
}

async function stageChanges(watchPaths = []) {
    // Decide staging strategy:
    // 1. Stage specific paths: More controlled, but might miss files if watchPaths is complex.
    // 2. Stage all (`git add .`): Simpler, relies on .gitignore and subsequent diff check.
    // Let's go with staging all for simplicity initially, assuming watchPaths primarily defines *what changes trigger* the cycle.
    console.log("Staging all changes ('git add .')...");
    try {
        await runGitCommand(['add', '.']);
        console.log("Staging successful.");
    } catch (error) {
        console.error("Error during staging:", error.message);
        throw error; // Re-throw to be caught by the main cycle handler
    }
}

async function getDiff() {
    console.log("Getting staged diff ('git diff --staged')...");
    try {
        // Use --staged to get diff of what's about to be committed
        const diffOutput = await runGitCommand(['diff', '--staged']);
        // console.log("Diff output:", diffOutput); // Optional: log diff for debugging
        return diffOutput;
    } catch (error) {
        console.error("Error getting diff:", error.message);
        // If diff fails, maybe there's nothing staged? Or a real git issue.
        // Let's return empty string in this case, the commit logic will handle it.
        return '';
        // Alternatively, re-throw: throw error;
    }
}

async function commitChanges(message) {
    console.log(`Committing changes with message: "${message}"...`);
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
        throw new Error("Commit message cannot be empty.");
    }
    try {
        // Use -m flag for the message
        await runGitCommand(['commit', '-m', message]);
        console.log("Commit successful.");
    } catch (error) {
        console.error("Error during commit:", error.message);
        // Specific handling for "nothing to commit" might be needed if stageChanges/getDiff logic allows it
        if (error.message.includes("nothing to commit")) {
             console.log("Nothing to commit, working tree clean.");
             return; // Not really an error in our flow
        }
        throw error; // Re-throw other errors
    }
}

module.exports = {
  stageChanges,
  getDiff,
  commitChanges,
};