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
  watchPaths: ['src/'],
  commitIntervalSeconds: 300, // Default interval 5 minutes
  llm: {
    provider: 'openai',
    model: 'gpt-4o-mini', // Default model
  },
  commitPrefix: '[Auto commit]',
};

// --- Configuration Loading ---

function loadConfig() {
  const projectRoot = process.cwd();
  const configDirPath = path.join(projectRoot, CONFIG_DIR_NAME);
  const configFilePath = path.join(configDirPath, CONFIG_FILE_NAME);
  const envFilePath = path.join(configDirPath, ENV_FILE_NAME); // Env file inside config dir

  console.log(`Loading configuration from ${configFilePath} and ${envFilePath}...`);
  let userConfig = {};

  // Load .auto-commiter/config.yaml
  try {
    if (fs.existsSync(configFilePath)) {
      const fileContents = fs.readFileSync(configFilePath, 'utf8');
      userConfig = yaml.load(fileContents);
      console.log(`Loaded user config from ${configFilePath}`);
    } else {
      console.log(`${configFilePath} not found, using default configuration.`);
      // Optionally create the directory and default config if not found? Or let init handle it.
      // For loadConfig, let's assume init has run or defaults are acceptable.
    }
  } catch (e) {
    console.error(`Error reading or parsing ${configFilePath}:`, e);
  }

  // Load .auto-commiter/.env
  try {
      // Specify the path for dotenv
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
   // Basic validation for watchPaths
   if (!Array.isArray(config.watchPaths) || config.watchPaths.length === 0) {
       console.warn(`'watchPaths' is missing or empty in ${configFilePath}. Defaulting to ['src/'].`);
       config.watchPaths = ['src/'];
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
    const gitignoreEntry = `${CONFIG_DIR_NAME}/${ENV_FILE_NAME}`; // Path to ignore

    // Ensure config directory exists
    if (!fs.existsSync(configDirPath)) {
        fs.mkdirSync(configDirPath);
        console.log(`Created directory: ${CONFIG_DIR_NAME}`);
    }

    // 1. Create .auto-commiter/config.yaml template
    if (!fs.existsSync(configFilePath)) {
        const defaultConfigYaml = yaml.dump(DEFAULT_CONFIG);
        fs.writeFileSync(configFilePath, `# Auto Commiter Configuration File\n\n${defaultConfigYaml}`);
        console.log(`Created default configuration file: ${configFilePath}`);
    } else {
        console.log(`${configFilePath} already exists.`);
    }

    // 2. Create .auto-commiter/.env.example template
    if (!fs.existsSync(envExampleFilePath)) {
        fs.writeFileSync(envExampleFilePath, `# Environment variables for Auto Commiter (loaded from ${envFilePath})\nOPENAI_API_KEY=\n`);
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
        // Check for the specific path, including the directory
        if (!gitignoreContent.includes(gitignoreEntry)) {
            fs.appendFileSync(gitignorePath, `\n# Auto Commiter environment file\n${gitignoreEntry}\n`);
            console.log(`Added ${gitignoreEntry} to .gitignore`);
        } else {
             console.log(`${gitignoreEntry} already exists in .gitignore`);
        }
    } catch (e) {
        console.error("Could not update .gitignore:", e);
    }

    // 4. Ask about VS Code task setup
    const answer = await askQuestion(`Do you want to automatically start Auto Commiter when opening this workspace in VS Code? (y/N) `);

    if (answer === 'y') {
        await setupVsCodeTask(projectRoot); // Pass projectRoot, task setup remains in .vscode
    } else {
        console.log("Skipping VS Code task setup.");
    }

    rl.close(); // Close the readline interface
    console.log("\nInitialization complete.");
    console.log(`Next steps:`);
    console.log(`  1. If needed, rename ${envExampleFilePath} to ${envFilePath} and add your OPENAI_API_KEY.`);
    console.log(`  2. Edit ${configFilePath} to configure watchPaths, interval, etc.`);
    console.log(`  3. Run 'npx auto-committer start' (or reopen VS Code if you enabled the task).`); // Corrected command

}

// VS Code Task setup remains the same, creating .vscode/tasks.json at project root
async function setupVsCodeTask(projectRoot) {
    const vscodeDirPath = path.join(projectRoot, VSCODE_DIR);
    const tasksFilePath = path.join(vscodeDirPath, TASKS_FILE_NAME);
    const taskDefinition = {
        label: "Start Auto Committer", // Corrected label
        type: "shell",
        command: "npx auto-committer start", // Corrected command
        isBackground: true,
        problemMatcher: [],
        presentation: {
            reveal: "silent",
            panel: "dedicated",
            showReuseMessage: false,
            clear: true
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

    } catch (e) {
        console.error(`Failed to create or update ${tasksFilePath}:`, e);
    }
}


module.exports = {
  loadConfig,
  runInit,
};