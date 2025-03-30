const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const dotenv = require('dotenv');
const readline = require('readline'); // For user interaction in init

console.log("src/config-loader.js loaded");

const CONFIG_DIR_NAME = '.auto-committer'; // Corrected directory name
const CONFIG_FILE_NAME = 'config.yaml';
const ENV_FILE_NAME = '.env'; // Keep standard name within the dir
const ENV_EXAMPLE_FILE_NAME = '.env.example';
const VSCODE_DIR = '.vscode';
const TASKS_FILE_NAME = 'tasks.json';

const DEFAULT_CONFIG = {
  // watchPaths: ['src/'], // Removed watchPaths
  commitIntervalSeconds: 300, // Default interval 5 minutes
  llm: {
    provider: 'openai',
    model: 'gpt-4o-mini', // Default model
  },
  commitPrefix: '[Auto commit]',
  autoPush: false, // Default autoPush setting
};

// --- Configuration Loading ---

function loadConfig() {
  const projectRoot = process.cwd();
  const configDirPath = path.join(projectRoot, CONFIG_DIR_NAME);
  const configFilePath = path.join(configDirPath, CONFIG_FILE_NAME);
  const envFilePath = path.join(configDirPath, ENV_FILE_NAME); // Env file inside config dir

  console.log(`Loading configuration from ${configFilePath} and ${envFilePath}...`);
  let userConfig = {};

  // Load .auto-committer/config.yaml
  try {
    if (fs.existsSync(configFilePath)) {
      const fileContents = fs.readFileSync(configFilePath, 'utf8');
      userConfig = yaml.load(fileContents);
      console.log(`Loaded user config from ${configFilePath}`);
    } else {
      console.log(`${configFilePath} not found, using default configuration.`);
    }
  } catch (e) {
    console.error(`Error reading or parsing ${configFilePath}:`, e);
  }

  // Load .auto-committer/.env
  try {
      dotenv.config({ path: envFilePath });
      console.log(`Loaded environment variables from ${envFilePath}`);
  } catch(e) {
      console.warn(`Could not load ${envFilePath}. Ensure it exists and contains necessary keys like OPENAI_API_KEY.`);
  }


  // Merge user config with defaults
  const config = {
      ...DEFAULT_CONFIG,
      ...userConfig,
      llm: {
          ...DEFAULT_CONFIG.llm,
          ...(userConfig.llm || {}),
      }
   };

  // Validate commitIntervalSeconds
  const minInterval = 180;
  if (typeof config.commitIntervalSeconds !== 'number' || config.commitIntervalSeconds < minInterval) {
       throw new Error(`'commitIntervalSeconds' in ${configFilePath} must be a number and at least ${minInterval} seconds. Current value: ${config.commitIntervalSeconds}`);
  }

  console.log("Final configuration:", config);
  return config;
}

// --- Initialization Logic ---

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(query) {
  const WARNING_PREFIX = "\n⚠️ WARNING: ";
  const RESET = "\n";
  if (query.includes("WARNING:")) {
      query = query.replace("WARNING:", WARNING_PREFIX) + RESET;
  }
  return new Promise(resolve => rl.question(query, ans => {
    resolve(ans.trim().toLowerCase());
  }))
}

async function runInit() {
    console.log("Running initialization process...");
    const projectRoot = process.cwd();
    const configDirPath = path.join(projectRoot, CONFIG_DIR_NAME);
    const configFilePath = path.join(configDirPath, CONFIG_FILE_NAME);
    const envExampleFilePath = path.join(configDirPath, ENV_EXAMPLE_FILE_NAME);
    const envFilePath = path.join(configDirPath, ENV_FILE_NAME);
    const gitignorePath = path.join(projectRoot, '.gitignore');
    const gitignoreEntry = `${CONFIG_DIR_NAME}/${ENV_FILE_NAME}`;

    // Ensure config directory exists
    if (!fs.existsSync(configDirPath)) {
        fs.mkdirSync(configDirPath);
        console.log(`Created directory: ${CONFIG_DIR_NAME}`);
    }

    // Ask about auto push first
    const autoPushAnswer = await askQuestion(
        `Enable automatic 'git push' after each commit? (y/N) ` +
        `WARNING: This might push incomplete work and requires proper remote setup/authentication.`
    );
    const enableAutoPush = autoPushAnswer === 'y';
    if (enableAutoPush) {
        console.log("Auto push enabled. Ensure your Git remote is configured correctly.");
    } else {
        console.log("Auto push disabled.");
    }

    // 1. Create .auto-committer/config.yaml template (without watchPaths)
    if (!fs.existsSync(configFilePath)) {
        const configToWrite = { ...DEFAULT_CONFIG, autoPush: enableAutoPush };
        const defaultConfigYaml = yaml.dump(configToWrite);
        fs.writeFileSync(configFilePath, `# Auto Committer Configuration File\n\n${defaultConfigYaml}`);
        console.log(`Created default configuration file: ${configFilePath}`);
    } else {
        console.log(`${configFilePath} already exists. Please manually add/update 'autoPush: ${enableAutoPush}' if needed.`);
    }

    // 2. Create .auto-committer/.env.example template
    if (!fs.existsSync(envExampleFilePath)) {
        fs.writeFileSync(envExampleFilePath, `# Environment variables for Auto Committer (loaded from ${envFilePath})\nOPENAI_API_KEY=\n`);
        console.log(`Created environment variable example file: ${envExampleFilePath}`);
         if (!fs.existsSync(envFilePath)) {
             console.log(`IMPORTANT: Please rename ${envExampleFilePath} to ${envFilePath} and add your OpenAI API key.`);
         } else {
             console.log(`NOTE: ${envFilePath} already exists. Please ensure OPENAI_API_KEY is set in it, referring to ${envExampleFilePath} if needed.`);
         }
    } else {
         console.log(`${envExampleFilePath} already exists.`);
         if (!fs.existsSync(envFilePath)) {
             console.log(`IMPORTANT: Please rename ${envExampleFilePath} to ${envFilePath} and add your OpenAI API key.`);
         } else {
              console.log(`NOTE: ${envFilePath} already exists. Please ensure OPENAI_API_KEY is set in it.`);
         }
    }


    // 3. Update .gitignore
    try {
        let gitignoreContent = '';
        if (fs.existsSync(gitignorePath)) {
            gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
        }
        if (!gitignoreContent.includes(gitignoreEntry)) {
            fs.appendFileSync(gitignorePath, `\n# Auto Committer environment file\n${gitignoreEntry}\n`);
            console.log(`Added ${gitignoreEntry} to .gitignore`);
        } else {
             console.log(`${gitignoreEntry} already exists in .gitignore`);
        }
    } catch (e) {
        console.error("Could not update .gitignore:", e);
    }

    // 4. Ask about VS Code task setup
    const vscodeAnswer = await askQuestion(`Do you want to automatically start Auto Committer when opening this workspace in VS Code? (y/N) `);

    if (vscodeAnswer === 'y') {
        await setupVsCodeTask(projectRoot); // Call the corrected setup function
    } else {
        console.log("Skipping VS Code task setup.");
    }

    rl.close();
    console.log("\nInitialization complete.");
    console.log(`Next steps:`);
    console.log(`  1. If needed, rename ${envExampleFilePath} to ${envFilePath} and add your OPENAI_API_KEY.`);
    console.log(`  2. Edit ${configFilePath} to configure interval, autoPush etc.`);
    console.log(`  3. Run 'npx auto-committer start' manually or reopen VS Code if you enabled the task.`);

}

// Corrected VS Code Task setup function - Source NVM then run npx
async function setupVsCodeTask(projectRoot) {
    const vscodeDirPath = path.join(projectRoot, VSCODE_DIR);
    const tasksFilePath = path.join(vscodeDirPath, TASKS_FILE_NAME);
    // Command to source NVM and then run npx
    const nvmScriptPath = process.env.NVM_DIR ? `${process.env.NVM_DIR}/nvm.sh` : `${process.env.HOME}/.nvm/nvm.sh`; // Common NVM script paths
    const commandToRun = `source ${nvmScriptPath} && npx -- auto-committer start`;
    const taskDefinition = {
        label: "Start Auto Committer",
        type: "shell",
        command: commandToRun,
        isBackground: true,
        problemMatcher: [],
        presentation: {
            reveal: "silent",
            panel: "dedicated",
            showReuseMessage: false,
            clear: true
        },
        options: { // Ensure bash is used for sourcing
            shell: {
                executable: "bash",
                args: ["-c"]
            }
        },
        runOptions: {
            runOn: "folderOpen"
        }
    };

    try {
        if (!fs.existsSync(vscodeDirPath)) {
            fs.mkdirSync(vscodeDirPath);
        }

        let tasksJson = { version: "2.0.0", tasks: [] };

        if (fs.existsSync(tasksFilePath)) {
            try {
                const existingContent = fs.readFileSync(tasksFilePath, 'utf8');
                if (existingContent.trim()) {
                    tasksJson = JSON.parse(existingContent);
                    if (!tasksJson.tasks || !Array.isArray(tasksJson.tasks)) {
                         console.warn(`${TASKS_FILE_NAME} has invalid format. Overwriting with new task.`);
                         tasksJson.tasks = [];
                    }
                }
            } catch (parseError) {
                console.error(`Error parsing existing ${TASKS_FILE_NAME}. Backing up and creating a new one.`, parseError);
                tasksJson = { version: "2.0.0", tasks: [] };
            }
        }

        const existingTaskIndex = tasksJson.tasks.findIndex(task => task.label === taskDefinition.label);
        if (existingTaskIndex !== -1) {
            tasksJson.tasks[existingTaskIndex] = taskDefinition;
            console.log(`Updated existing '${taskDefinition.label}' task in ${tasksFilePath}`);
        } else {
            tasksJson.tasks.push(taskDefinition);
            console.log(`Added '${taskDefinition.label}' task to ${tasksFilePath}`);
        }

        fs.writeFileSync(tasksFilePath, JSON.stringify(tasksJson, null, 2));
        console.log(`VS Code task configured to run: ${commandToRun}`);
        console.log(`Note: Assumes NVM script is at ${nvmScriptPath}. Adjust if needed.`);


    } catch (e) {
        console.error(`Failed to create or update ${tasksFilePath}:`, e);
    }
}


module.exports = {
  loadConfig,
  runInit,
};