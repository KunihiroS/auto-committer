# Auto Committer (tool for lazy boys and girls)


> **⚠️ Important Usage Note**
>
> Auto Committer periodically runs `git add`, `git commit`, and `git push` (if enabled) in the background.
> This tool **does not perform Git repository locking**. Therefore, running manual `git` commands (especially those that modify the state like staging, committing, pushing, or resetting) while Auto Committer is processing can lead to **unexpected behavior, inconsistent commit contents, or errors**.
>
> It is strongly recommended to temporarily stop Auto Committer (Ctrl+C in the terminal or stop the VS Code task) before performing significant manual Git operations while it is running.

## Overview

Auto Committer is a CLI tool that **automatically stages changes and creates local commits without manual developer intervention** for software projects managed with Git in a local repository. Commit messages are **automatically generated using an LLM (Large Language Model)**. Optionally, it can also automatically execute `git push` after committing.

## Purpose

In the development process, frequent manual staging and committing can be tedious, and maintaining the quality of commit messages is also a challenge. This tool aims to automate these tasks, reducing the burden on developers and allowing them to focus on more essential development work. Additionally, LLM-generated commit messages help maintain a consistent and understandable commit history.

## Key Features

*   **Periodic Execution:** Executes the auto-commit process at a **time interval** specified in the configuration file (default: 300 seconds, minimum 180 seconds).
*   **Automatic Staging & Committing:** During the periodic execution, it automatically stages (`git add .`) **all changes not listed in `.gitignore`** and creates a local commit (`git commit`). No commit is made if there are no changes. The commit scope is controlled by `.gitignore`.
*   **LLM-Generated Commit Messages:** Generates appropriate commit messages based on the staged diff (`git diff --staged`) using the configured LLM (currently only OpenAI API is supported). A configured prefix (default: `[Auto commit]`) is added to the generated messages.
*   **Countdown Display:** Displays a countdown in seconds until the next auto-commit execution in the terminal where the `start` command was run.
*   **Automatic Push (Optional):** If enabled via the configuration file (`autoPush: true`) or during the `init` interactive setup, it automatically executes `git push` after a successful auto-commit (pushes the current branch to the `origin` remote).

## Tech Stack

*   **Development Language:** Node.js (v18.0.0 or higher)
*   **Package Manager:** npm (or yarn, pnpm)
*   **Execution Environment:** CLI tool runnable via `npx`
*   **Key Dependencies:**
    *   `js-yaml`: Parsing the configuration file (`config.yaml`)
    *   `dotenv`: Loading environment variables (`.env`)
    *   `openai`: Interacting with the OpenAI API
*   **Configuration Files:**
    *   `.auto-committer/config.yaml`: Execution interval, LLM settings, auto-push settings, etc.
    *   `.auto-committer/.env`: Environment variables such as API keys.

## Installation and Usage

1.  **Prerequisites:**
    *   Node.js (v18.0.0 or higher) and npm (or yarn, pnpm) installed.
    *   Git installed.
    *   An OpenAI API key obtained.
2.  **Initial Setup (Per Project):**
    *   In the root directory of your target Git repository, run the following command to perform the initial setup for Auto Committer:
    ```bash
    npx @kunihiros/auto-committer init
    ```
    *   This command performs the following actions:
        *   Creates the `.auto-committer/` directory.
        *   **Generates configuration file templates (in `.auto-committer/`):**
            *   `config.yaml`: Template for specifying execution interval, LLM settings, auto-push settings, etc.
            *   `.env.example`: Template for setting the OpenAI API key, etc.
        *   **Updates `.gitignore`:** Adds `.auto-committer/.env` to `.gitignore` to prevent the environment file from being tracked by Git (creates `.gitignore` if it doesn't exist).
        *   **Auto Push Setup (Interactive):**
             *   Prompts you during execution: "Enable automatic 'git push' after each commit? (y/N) WARNING: This might push incomplete work..."
             *   If you answer `y`, `autoPush` will be set to `true` in the generated `config.yaml`.
        *   **VS Code Auto-Start Setup (Interactive):**
            *   Prompts you during execution: "Do you want to automatically start Auto Committer when opening this workspace in VS Code? (y/N)"
            *   If you answer `y`, a task to automatically start Auto Committer will be added to `.vscode/tasks.json`.
3.  **API Key Configuration:**
    *   Rename the generated `.auto-committer/.env.example` file to `.auto-committer/.env`.
    *   Open the `.auto-committer/.env` file and enter your OpenAI API key after `OPENAI_API_KEY=`.
    ```dotenv
    # .auto-committer/.env
    OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    ```
4.  **Configuration:**
    *   Open the generated `.auto-committer/config.yaml` file and edit the following items as needed:
        *   `commitIntervalSeconds`: Specify the **interval** in seconds for executing auto-commits (default: `300`, minimum: `180`).
        *   `llm`: Specify the LLM provider (`openai`) and model name (`gpt-4o-mini`, etc.).
        *   `commitPrefix`: Optional prefix to add to auto-generated commit messages.
        *   `autoPush`: Whether to execute `git push` after auto-commit (`true` or `false`).
    ```yaml
    # .auto-committer/config.yaml example
    commitIntervalSeconds: 300 # Every 5 minutes
    llm:
      provider: openai
      model: gpt-4o-mini
    # commitPrefix: "[Auto]"
    autoPush: false # If 'n' was selected during init
    ```
5.  **Start Execution:**
    *   **With VS Code Auto-Start (Recommended):** If you enabled auto-start during `init`, the process will start automatically in the background when you open the workspace in VS Code. You can monitor its status in the VS Code Terminal panel.
    *   **Manual Start:** In the project root directory, run the following command to start the periodic commit process **in the current terminal**:
    ```bash
    npx @kunihiros/auto-committer start
    ```
    *   The process runs in the foreground, displaying a countdown to the next commit and logs for commit executions.
    *   **Note (Manual Start):** The process will terminate if you press `Ctrl+C` in this terminal session or close the terminal. You need to keep this terminal open while monitoring is active.
6.  **Development Workflow:**
    *   After running the `start` command (or after VS Code auto-start), the tool will automatically stage changes in your repository at the configured interval and, if changes exist, create a commit with an LLM-generated message.
7.  **Stop Execution:**
    *   **If started via VS Code Task:** Terminate the task manually from the VS Code Terminal panel or close VS Code.
    *   **If started manually:** Press `Ctrl+C` in the terminal where the `start` command is running.

## Important Notes

*   **Commit Granularity:** Automatic commits at regular intervals might result in commits containing incomplete work. Adjusting the `commitIntervalSeconds` is crucial. **Furthermore, to ensure system stability and prevent unexpected behavior, the execution interval must be set to at least 180 seconds (3 minutes).**
*   **Commit Scope:** This tool commits all tracked file changes according to `.gitignore`. It cannot target specific files for auto-commit. Add files you don't want committed to `.gitignore`.
*   **Performance:** Periodic `git add .` and `git diff --staged` might impact performance in very large repositories.
*   **LLM Costs and Accuracy:** Using external LLMs like the OpenAI API incurs costs based on usage. While no commit or LLM call occurs if there are no changes, frequent changes will increase costs. Using local LLMs requires setup and consideration of model accuracy.
*   **Auto Push Risks:** Enabling `autoPush: true` might push unfinished code to the remote repository unintentionally. If conflicts occur with the remote, `git push` will fail, requiring manual resolution. Use auto-push with a full understanding of these risks, preferably with a suitable branching strategy and team agreement. Ensure necessary authentication (SSH keys, HTTPS tokens) for `git push` is configured in your environment.

## Known Issues / Future Improvements

*   Support for local LLMs (Ollama, etc.)
*   Ability to specify the remote/branch for auto-push
*   More detailed error handling and notifications
*   Optimization of LLM prompts for very large diffs
*   Expansion of test code coverage
