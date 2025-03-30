const OpenAI = require('openai');

console.log("src/llm-service.js loaded");

// Initialize OpenAI client lazily or globally?
// Let's initialize when needed, assuming API key might be loaded just before.
let openaiClient = null;

function initializeOpenAI() {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY is not set in the environment variables (.autocommit.env).");
    }
    if (!openaiClient) {
        openaiClient = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }
}

function createPrompt(diff) {
    // Simple prompt, can be improved significantly
    // Consider adding context like language, project type, etc. if available
    // Also consider diff size limits for the prompt
    const MAX_DIFF_LENGTH = 128000; // Adjust based on model context window and desired token usage
    const truncatedDiff = diff.length > MAX_DIFF_LENGTH ? diff.substring(0, MAX_DIFF_LENGTH) + "\n... (diff truncated)" : diff;

    return `Generate a concise Git commit message (around 50 characters, imperative mood, present tense) for the following code changes:\n\n\`\`\`diff\n${truncatedDiff}\n\`\`\`\n\nCommit message:`;
}

async function generateCommitMessage(diff, llmConfig) {
    console.log(`Generating commit message using ${llmConfig.provider} (${llmConfig.model})...`);

    if (llmConfig.provider !== 'openai') {
        throw new Error(`LLM provider "${llmConfig.provider}" is not supported yet.`);
    }

    try {
        initializeOpenAI(); // Ensure client is ready and API key is loaded

        const prompt = createPrompt(diff);
        const model = llmConfig.model || 'gpt-4o-mini'; // Use config model or default
        const options = llmConfig.options || {}; // Use additional options if provided

        console.log(`Sending request to OpenAI model: ${model}...`);

        // Using Chat Completions API is generally recommended over older Completions API
        const chatCompletion = await openaiClient.chat.completions.create({
            messages: [
                // Optional: System message to set the context/role
                // { role: "system", content: "You are a helpful assistant that generates Git commit messages." },
                { role: "user", content: prompt }
            ],
            model: model,
            temperature: options.temperature || 0.7, // Default temperature if not specified
            max_tokens: 4096, // Limit response length
            n: 1, // Generate one message
            stop: ["\n"], // Stop generation at newline if possible
            ...options // Spread any other options from config
        });

        // console.log("OpenAI Response:", JSON.stringify(chatCompletion, null, 2)); // Debugging

        let generatedMessage = chatCompletion.choices[0]?.message?.content?.trim();

        if (!generatedMessage) {
            console.warn("LLM returned an empty message. Using a default message.");
            generatedMessage = "Auto commit: Updated files"; // Fallback message
        }

        // Remove potential quotes around the message if the model added them
        generatedMessage = generatedMessage.replace(/^["']|["']$/g, '');

        console.log("Generated commit message:", generatedMessage);
        return generatedMessage;

    } catch (error) {
        console.error("Error generating commit message from OpenAI:", error);
        // Decide on fallback behavior: throw error or return default message?
        // Let's return a default message for now to avoid breaking the commit cycle entirely.
        return "Auto commit: Error generating message";
    }
}

module.exports = {
  generateCommitMessage,
};