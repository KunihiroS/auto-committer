const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { mkdtempSync, rmSync } = fs;
console.log("src/git-handler.js loaded");

// Helper function to run git commands
function runGitCommand(args, cwd = process.cwd(), stdin = null) {
    return new Promise((resolve, reject) => {
        console.log(`Running: git ${args.join(' ')}`); // Log the command being run
        const gitProcess = spawn('git', args, { cwd, stdio: [stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
        let stdoutData = '';
        let stderrData = '';

        if (stdin) {
            gitProcess.stdin.write(stdin);
            gitProcess.stdin.end();
        }

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

/**
 * 一時ディレクトリを作成
 */
function createTempDir() {
    const tmpBase = os.tmpdir();
    return mkdtempSync(path.join(tmpBase, 'auto-committer-backup-'));
}

/**
 * ディレクトリが存在するか
 */
function dirExists(dirPath) {
    try {
        return fs.statSync(dirPath).isDirectory();
    } catch {
        return false;
    }
}

/**
 * 指定したブランチが存在するか確認
 */
async function branchExists(branchName) {
    try {
        const result = await runGitCommand(['rev-parse', '--verify', branchName]);
        return !!result;
    } catch {
        return false;
    }
}

/**
 * ブランチをチェックアウト
 */
async function checkoutBranch(branchName) {
    await runGitCommand(['checkout', branchName]);
}

/**
 * 新しいブランチを作成
 */
async function createBranch(branchName, from = null) {
    if (from) {
        await runGitCommand(['checkout', '-b', branchName, from]);
    } else {
        await runGitCommand(['checkout', '-b', branchName]);
    }
}

/**
 * auto-committer-backup ブランチがなければ作成し、チェックアウト
 */
async function ensureAndCheckoutBackupBranch() {
    const backupBranch = 'auto-committer-backup';
    const currentBranch = await getCurrentBranch();
    if (currentBranch === backupBranch) {
        return { backupBranch, originalBranch: currentBranch };
    }
    const exists = await branchExists(backupBranch);
    if (!exists) {
        await createBranch(backupBranch, currentBranch);
    } else {
        await checkoutBranch(backupBranch);
    }
    return { backupBranch, originalBranch: currentBranch };
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

/**
 * 低レベルコマンドを使用して、現在のインデックス状態をバックアップブランチにコミット
 */
async function commitChanges(message) {
    console.log(`Committing staged changes with message: "${message}"...`);
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
        throw new Error("Commit message cannot be empty.");
    }

    const backupBranch = 'auto-committer-backup';

    try {
        // 1. 現在のインデックス状態からツリーオブジェクトを作成
        const stagedIndexTree = await runGitCommand(['write-tree']);
        if (!stagedIndexTree) {
            throw new Error("Failed to write git tree from index.");
        }
        console.log(`Created tree object for staged changes: ${stagedIndexTree}`);

        // 2. バックアップブランチが存在するか確認し、親コミットを決定
        const backupBranchExists = await branchExists(backupBranch);
        let parentCommitArgs = [];
        let currentBackupTree = '';

        if (backupBranchExists) {
            const parentSha = await runGitCommand(['rev-parse', backupBranch]);
            parentCommitArgs = ['-p', parentSha];
            try {
                // バックアップブランチの最新コミットのツリーを取得
                currentBackupTree = await runGitCommand(['rev-parse', `${backupBranch}^{tree}`]);
            } catch (treeError) {
                console.warn(`Could not get tree for existing backup branch ${backupBranch}. Proceeding anyway.`);
            }
        } else {
            // バックアップブランチがない場合、現在のHEADを親とする (最初のバックアップコミット)
            const currentHead = await runGitCommand(['rev-parse', 'HEAD']);
            parentCommitArgs = ['-p', currentHead];
            console.log(`Backup branch '${backupBranch}' not found. Will create it based on current HEAD (${currentHead}).`);
        }

        // 3. 変更がないか確認 (現在のインデックスツリーとバックアップブランチの最新ツリーを比較)
        if (backupBranchExists && stagedIndexTree === currentBackupTree) {
            console.log("No changes detected between staged files and the last backup commit. Skipping commit.");
            return; // 変更がない場合はコミットしない
        }

        // 4. コミットオブジェクトを作成
        const commitArgs = ['commit-tree', stagedIndexTree, ...parentCommitArgs, '-m', message];
        const newCommitSha = await runGitCommand(commitArgs);
        if (!newCommitSha) {
            throw new Error("Failed to create commit object.");
        }
        console.log(`Created new commit object: ${newCommitSha}`);

        // 5. バックアップブランチの参照を更新 (または作成)
        if (backupBranchExists) {
            await runGitCommand(['update-ref', `refs/heads/${backupBranch}`, newCommitSha]);
            console.log(`Updated backup branch '${backupBranch}' to commit ${newCommitSha}`);
        } else {
            await runGitCommand(['branch', backupBranch, newCommitSha]);
            console.log(`Created backup branch '${backupBranch}' pointing to commit ${newCommitSha}`);
        }

        console.log("Commit to backup branch successful.");

    } catch (error) {
        console.error("Error during commit to backup branch:", error.message);
        throw error; // Re-throw the error to be caught by the main cycle
    }
}

async function getCurrentBranch() {
    console.log("Getting current branch name...");
    try {
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
    const targetBranch = 'auto-committer-backup';
    console.log(`Pushing changes to ${remote}/${targetBranch}...`);
    try {
        await runGitCommand(['push', remote, targetBranch]);
        console.log("Push successful.");
    } catch (error) {
        console.error(`Error during push to ${remote}/${targetBranch}:`, error.message);
        if (error.message.includes("rejected") || error.message.includes("failed to push")) {
            console.error("Push failed. This might be due to remote changes (pull needed), authentication issues, or lack of permissions.");
        } else if (error.message.includes("does not appear to be a git repository") || error.message.includes("could not read from remote repository")) {
             console.error("Push failed. Could not connect to the remote repository. Check remote URL and network connection.");
        }
    }
}

const ignore = require('ignore');

async function untrackIgnoredFiles() {
    console.log("Checking for tracked files that should be ignored...");
    try {
        // 1. Read .gitignore patterns
        const gitignorePath = path.join(process.cwd(), '.gitignore');
        let gitignoreContent = '';
        try {
            gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
        } catch (e) {
            console.log(".gitignore not found, skipping untrack step.");
            return;
        }
        const ig = ignore();
        ig.add(gitignoreContent);

        // 2. Get list of tracked files
        const trackedFilesOutput = await runGitCommand(['ls-files', '-z']);
        if (!trackedFilesOutput) {
            console.log("No files are currently tracked.");
            return;
        }
        const trackedFiles = trackedFilesOutput.split('\0').filter(f => f);
        if (trackedFiles.length === 0) {
            console.log("No tracked files found.");
            return;
        }

        // 3. Filter files that match .gitignore patterns
        const filesToUntrack = ig.filter(trackedFiles, { ignorecase: false, dot: true, matchBase: true, });
        // ignore.filter returns files NOT ignored, so we need the complement
        const ignoredFiles = trackedFiles.filter(f => !filesToUntrack.includes(f));

        if (ignoredFiles.length === 0) {
            console.log("No tracked files match .gitignore rules.");
            return;
        }

        console.log(`Found ${ignoredFiles.length} tracked file(s) matching .gitignore:`);
        ignoredFiles.forEach(file => console.log(`  - ${file}`));

        // 4. Remove the ignored files from the index in batches
        const batchSize = 50;
        for (let i = 0; i < ignoredFiles.length; i += batchSize) {
            const batch = ignoredFiles.slice(i, i + batchSize);
            await runGitCommand(['rm', '--cached', '--', ...batch]);
        }

        console.log("Successfully untracked the above files.");

    } catch (error) {
        console.error("Error during untrackIgnoredFiles process:", error.message);
    }
}

module.exports = {
  stageChanges,
  getDiff,
  commitChanges,
  pushChanges, 
  untrackIgnoredFiles, 
};
