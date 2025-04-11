const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { mkdtempSync, rmSync } = fs;
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
 * worktree方式で全ファイルコピー＆コミット
 */
async function commitChanges(message) {
    console.log(`Committing changes with message: "${message}"...`);
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
        throw new Error("Commit message cannot be empty.");
    }
    const backupBranch = 'auto-committer-backup';
    const repoRoot = process.cwd();
    const tempDir = createTempDir();
    const ignoreList = ['.git', '.gitignore', '.auto-committer', 'node_modules'];
    try {
        // バックアップブランチがなければ作成
        const exists = await branchExists(backupBranch);
        if (!exists) {
            const currentBranch = await getCurrentBranch();
            await runGitCommand(['branch', backupBranch, currentBranch]);
        }
        // worktree追加
        await runGitCommand(['worktree', 'add', tempDir, backupBranch]);
        // worktree内の全ファイル削除（.gitは除く）
        for (const file of fs.readdirSync(tempDir)) {
            if (file === '.git') continue;
            const target = path.join(tempDir, file);
            rmSync(target, { recursive: true, force: true });
        }
        // 作業ディレクトリの全ファイルをコピー（ignoreList除く）
        function copyRecursive(src, dest) {
            if (ignoreList.some(ig => src.endsWith(ig))) return;
            const stat = fs.statSync(src);
            if (stat.isDirectory()) {
                if (!fs.existsSync(dest)) fs.mkdirSync(dest);
                for (const child of fs.readdirSync(src)) {
                    copyRecursive(path.join(src, child), path.join(dest, child));
                }
            } else {
                fs.copyFileSync(src, dest);
            }
        }
        for (const file of fs.readdirSync(repoRoot)) {
            if (ignoreList.includes(file)) continue;
            copyRecursive(path.join(repoRoot, file), path.join(tempDir, file));
        }
        // add/commit
        await runGitCommand(['add', '.'], tempDir);
        // 変更がなければコミットしない
        const status = await runGitCommand(['status', '--porcelain'], tempDir);
        if (!status || status.trim() === '') {
            console.log("No changes to commit in this cycle (worktree snapshot identical).");
            await runGitCommand(['worktree', 'remove', tempDir, '--force']);
            rmSync(tempDir, { recursive: true, force: true });
            return;
        }
        await runGitCommand(['commit', '-m', message], tempDir);
        console.log("Backup commit successful in worktree (full snapshot).");
        await runGitCommand(['worktree', 'remove', tempDir, '--force']);
        rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
        console.error("Error during backup commit (worktree full snapshot):", error.message);
        try {
            await runGitCommand(['worktree', 'remove', tempDir, '--force']);
        } catch {}
        try {
            rmSync(tempDir, { recursive: true, force: true });
        } catch {}
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
    // v0.2.0: 必ず auto-committer-backup ブランチをプッシュ
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