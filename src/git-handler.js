const { spawn } = require('child_process');
const path = require('path');

console.log("src/git-handler.js loaded");

// Helper function to run git commands
function runGitCommand(args, cwd = process.cwd()) {
    return new Promise((resolve, reject) => {
        console.log(`Running: git ${args.join(' ')}`); // Log the command being run
        const gitProcess = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
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
                // console.log(`git ${args.join(' ')} stdout:`, stdoutData.trim()); // Optional: log stdout
                resolve(stdoutData.trim());
            } else {
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
    console.log("Staging all changes ('git add .')...");
    try {
        await runGitCommand(['add', '.']);
        console.log("Staging successful.");
    } catch (error) {
        console.error("Error during staging:", error.message);
        throw error;
    }
}

async function getDiff() {
    console.log("Getting staged diff ('git diff --staged')...");
    try {
        const diffOutput = await runGitCommand(['diff', '--staged']);
        return diffOutput;
    } catch (error) {
        console.error("Error getting diff:", error.message);
        return '';
    }
}

async function commitChanges(message) {
    console.log(`Committing changes with message: "${message}"...`);
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
        throw new Error("Commit message cannot be empty.");
    }
    try {
        await runGitCommand(['commit', '-m', message]);
        console.log("Commit successful.");
    } catch (error) {
        console.error("Error during commit:", error.message);
        if (error.message.includes("nothing to commit")) {
             console.log("Nothing to commit, working tree clean.");
             return; // Not an error in this context
        }
        throw error;
    }
}

async function getCurrentBranch() {
    console.log("Getting current branch name...");
    try {
        // Using 'git branch --show-current' which is available in Git 2.22+
        // For older Git versions, 'git rev-parse --abbrev-ref HEAD' could be used
        const branchName = await runGitCommand(['branch', '--show-current']);
        if (!branchName) {
            throw new Error("Could not determine current branch. Are you in a detached HEAD state?");
        }
        console.log(`Current branch: ${branchName}`);
        return branchName;
    } catch (error) {
        console.error("Error getting current branch:", error.message);
        throw error;
    }
}

async function pushChanges(remote = 'origin', branch = null) {
    const targetBranch = branch || await getCurrentBranch(); // Use specified branch or get current
    console.log(`Pushing changes to ${remote}/${targetBranch}...`);
    try {
        // Simple push, assumes upstream is set or branch name matches remote
        // More robust implementation might use `git push --set-upstream origin <branch>` on first push
        await runGitCommand(['push', remote, targetBranch]);
        console.log("Push successful.");
    } catch (error) {
        console.error(`Error during push to ${remote}/${targetBranch}:`, error.message);
        // Provide more specific feedback if possible
        if (error.message.includes("rejected") || error.message.includes("failed to push")) {
            console.error("Push failed. This might be due to remote changes (pull needed), authentication issues, or lack of permissions.");
        } else if (error.message.includes("does not appear to be a git repository") || error.message.includes("could not read from remote repository")) {
             console.error("Push failed. Could not connect to the remote repository. Check remote URL and network connection.");
        }
        // Don't re-throw here? Or should the main loop know about push failures?
        // Let's not re-throw for now, just log the error.
    }
}

module.exports = {
  stageChanges,
  getDiff,
  commitChanges,
  pushChanges, // Export the new function
};