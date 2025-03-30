const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const dotenv = require('dotenv');
const readline = require('readline'); // For user interaction in init

console.log("src/config-loader.js loaded");

const CONFIG_FILE_NAME = '.autocommitrc';
const ENV_FILE_NAME = '.autocommit.env';
const ENV_EXAMPLE_FILE_NAME = '.autocommit.env.example';
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
  console.log(`Loading configuration from ${CONFIG_FILE_NAME} and ${ENV_FILE_NAME}...`);
  let userConfig = {};
  const configFilePath = path.resolve(process.cwd(), CONFIG_FILE_NAME);
  const envFilePath = path.resolve(process.cwd(), ENV_FILE_NAME);

  // Load .autocommitrc (YAML)
  try {
    if (fs.existsSync(configFilePath)) {
      const fileContents = fs.readFileSync(configFilePath, 'utf8');
      userConfig = yaml.load(fileContents);
      console.log(`Loaded user config from ${CONFIG_FILE_NAME}`);
    } else {
      console.log(`${CONFIG_FILE_NAME} not found, using default configuration.`);
    }
  } catch (e) {
    console.error(`Error reading or parsing ${CONFIG_FILE_NAME}:`, e);
    // Decide if we should proceed with defaults or exit
  }

  // Load .autocommit.env
  try {
      dotenv.config({ path: envFilePath });
      console.log(`Loaded environment variables from ${ENV_FILE_NAME}`);
  } catch(e) {
      console.warn(`Could not load ${ENV_FILE_NAME}. Ensure it exists and contains necessary keys like OPENAI_API_KEY.`);
  }


  // Merge user config with defaults (simple merge, could be deeper if needed)
  const config = {
      ...DEFAULT_CONFIG,
      ...userConfig,
      llm: { // Ensure llm object exists and merge its properties
          ...DEFAULT_CONFIG.llm,
          ...(userConfig.llm || {}),
      }
   };

  // Basic validation (can be expanded)
  if (!Array.isArray(config.watchPaths) || config.watchPaths.length === 0) {
      console.warn(`'watchPaths' is missing or empty in ${CONFIG_FILE_NAME}. Defaulting to ['src/'].`);
      config.watchPaths = ['src/'];
  }
   if (typeof config.commitIntervalSeconds !== 'number' || config.commitIntervalSeconds <= 0) {
        console.warn(`'commitIntervalSeconds' is invalid. Defaulting to 300.`);
        config.commitIntervalSeconds = 300;
   }
   // Add more validation as needed (e.g., for LLM config)

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
    const configFilePath = path.join(projectRoot, CONFIG_FILE_NAME);
    const envExampleFilePath = path.join(projectRoot, ENV_EXAMPLE_FILE_NAME);
    const envFilePath = path.join(projectRoot, ENV_FILE_NAME);
    const gitignorePath = path.join(projectRoot, '.gitignore');

    // 1. Create .autocommitrc template
    if (!fs.existsSync(configFilePath)) {
        const defaultConfigYaml = yaml.dump(DEFAULT_CONFIG);
        fs.writeFileSync(configFilePath, `# Auto Commiter Configuration File\n\n${defaultConfigYaml}`);
        console.log(`Created default configuration file: ${CONFIG_FILE_NAME}`);
    } else {
        console.log(`${CONFIG_FILE_NAME} already exists.`);
    }

    // 2. Create .autocommit.env.example template
    if (!fs.existsSync(envExampleFilePath)) {
        fs.writeFileSync(envExampleFilePath, `# Environment variables for Auto Commiter\nOPENAI_API_KEY=\n`);
        console.log(`Created environment variable example file: ${ENV_EXAMPLE_FILE_NAME}`);
         if (!fs.existsSync(envFilePath)) {
             console.log(`IMPORTANT: Please rename ${ENV_EXAMPLE_FILE_NAME} to ${ENV_FILE_NAME} and add your OpenAI API key.`);
         } else {
             console.log(`NOTE: ${ENV_FILE_NAME} already exists. Please ensure OPENAI_API_KEY is set in it, referring to ${ENV_EXAMPLE_FILE_NAME} if needed.`);
         }
    } else {
         console.log(`${ENV_EXAMPLE_FILE_NAME} already exists.`);
         if (!fs.existsSync(envFilePath)) {
             console.log(`IMPORTANT: Please rename ${ENV_EXAMPLE_FILE_NAME} to ${ENV_FILE_NAME} and add your OpenAI API key.`);
         } else {
              console.log(`NOTE: ${ENV_FILE_NAME} already exists. Please ensure OPENAI_API_KEY is set in it.`);
         }
    }


    // 3. Update .gitignore
    try {
        let gitignoreContent = '';
        if (fs.existsSync(gitignorePath)) {
            gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
        }
        if (!gitignoreContent.includes(ENV_FILE_NAME)) {
            fs.appendFileSync(gitignorePath, `\n# Auto Commiter environment file\n${ENV_FILE_NAME}\n`);
            console.log(`Added ${ENV_FILE_NAME} to .gitignore`);
        } else {
             console.log(`${ENV_FILE_NAME} already exists in .gitignore`);
        }
    } catch (e) {
        console.error("Could not update .gitignore:", e);
    }

    // 4. Ask about VS Code task setup
    const answer = await askQuestion(`Do you want to automatically start Auto Commiter when opening this workspace in VS Code? (y/N) `);

    if (answer === 'y') {
        await setupVsCodeTask(projectRoot);
    } else {
        console.log("Skipping VS Code task setup.");
    }

    rl.close(); // Close the readline interface
    console.log("\nInitialization complete.");
    console.log(`Next steps:`);
    console.log(`  1. If needed, rename ${ENV_EXAMPLE_FILE_NAME} to ${ENV_FILE_NAME} and add your OPENAI_API_KEY.`);
    console.log(`  2. Edit ${CONFIG_FILE_NAME} to configure watchPaths, interval, etc.`);
    console.log(`  3. Run 'npx auto-commiter start' (or reopen VS Code if you enabled the task).`);

}

async function setupVsCodeTask(projectRoot) {
    const vscodeDirPath = path.join(projectRoot, VSCODE_DIR);
    const tasksFilePath = path.join(vscodeDirPath, TASKS_FILE_NAME);
    const taskDefinition = {
        label: "Start Auto Commiter",
        type: "shell",
        command: "npx auto-commiter start",
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
                // Basic check to avoid parsing empty/invalid JSON
                if (existingContent.trim()) {
                    tasksJson = JSON.parse(existingContent);
                    if (!tasksJson.tasks || !Array.isArray(tasksJson.tasks)) {
                         console.warn(`${TASKS_FILE_NAME} has invalid format. Overwriting with new task.`);
                         tasksJson.tasks = [];
                    }
                }
            } catch (parseError) {
                console.error(`Error parsing existing ${TASKS_FILE_NAME}. Backing up and creating a new one.`, parseError);
                // Optional: Backup existing file before overwriting
                // fs.copyFileSync(tasksFilePath, `${tasksFilePath}.bak`);
                tasksJson = { version: "2.0.0", tasks: [] };
            }
        }

        // Check if the task already exists
        const existingTaskIndex = tasksJson.tasks.findIndex(task => task.label === taskDefinition.label);
        if (existingTaskIndex !== -1) {
            // Update existing task
            tasksJson.tasks[existingTaskIndex] = taskDefinition;
            console.log(`Updated existing '${taskDefinition.label}' task in ${tasksFilePath}`);
        } else {
            // Add new task
            tasksJson.tasks.push(taskDefinition);
            console.log(`Added '${taskDefinition.label}' task to ${tasksFilePath}`);
        }

        fs.writeFileSync(tasksFilePath, JSON.stringify(tasksJson, null, 2)); // Pretty print JSON

    } catch (e) {
        console.error(`Failed to create or update ${tasksFilePath}:`, e);
    }
}


module.exports = {
  loadConfig,
  runInit,
};