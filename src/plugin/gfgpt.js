import { writeFile } from "fs/promises";
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch'; // Make sure to use node-fetch

// Get the absolute path for the chat history file
const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename);
const chatHistoryFile = path.resolve(__dirname, '../mistral_history.json');

const mistralSystemPrompt = "you are a good assistant";

// Load chat history from file
let chatHistory = readChatHistoryFromFile();

// Utility function to read chat history from file
function readChatHistoryFromFile() {
    try {
        const data = fs.readFileSync(chatHistoryFile, "utf-8");
        return JSON.parse(data);
    } catch (err) {
        return {};
    }
}

// Utility function to write chat history to file
function writeChatHistoryToFile() {
    fs.writeFileSync(chatHistoryFile, JSON.stringify(chatHistory, null, 2));
}

// Utility function to update chat history
function updateChatHistory(sender, message) {
    // If this is the first message from the sender, create a new array for the sender
    if (!chatHistory[sender]) {
        chatHistory[sender] = [];
    }
    // Add the message to the sender's chat history
    chatHistory[sender].push(message);
    // If the chat history exceeds the maximum length of 20 messages, remove the oldest message
    if (chatHistory[sender].length > 20) {
        chatHistory[sender].shift();
    }
    writeChatHistoryToFile(); // Save the updated chat history to file
}

// Utility function to delete user's chat history
function deleteChatHistory(userId) {
    delete chatHistory[userId];
    writeChatHistoryToFile(); // Save the updated chat history to file
}

const mistral = async (m, Matrix) => {
    const text = m.body.toLowerCase();

    if (text === "/forget") {
        // Delete the user's chat history
        deleteChatHistory(m.sender);
        await Matrix.sendMessage(m.from, { text: 'Conversation deleted successfully' }, { quoted: m });
        // Return to exit the function
        return;
    }

    const prefixMatch = m.body.match(/^[\\/!#.]/);
    const prefix = prefixMatch ? prefixMatch[0] : '/';
    const cmd = m.body.startsWith(prefix) ? m.body.slice(prefix.length).split(' ')[0].toLowerCase() : '';
    const prompt = m.body.slice(prefix.length + cmd.length).trim().toLowerCase();
    
            const validCommands = ['gf'];

  if (validCommands.includes(cmd)) {
        if (!prompt) {
            await Matrix.sendMessage(m.from, { text: 'Please give me a prompt' }, { quoted: m });
            return;
        }

        try {
            // Get chat history for the sender
            const senderChatHistory = chatHistory[m.sender] || [];

            // Include chat history in the messages array
            const messages = [
                { role: "system", content: mistralSystemPrompt },
                ...senderChatHistory,
                { role: "user", content: prompt }
            ];

            const response = await fetch('https://matrixcoder.tech/api/ai', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    type: "text-generation",
                    model: "@cf/meta/llama-3-8b-instruct",
                    messages: messages
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const responseData = await response.json();

            updateChatHistory(m.sender, { role: "user", content: prompt });
            updateChatHistory(m.sender, { role: "assistant", content: responseData.result.response });

            await Matrix.sendMessage(m.from, { text: responseData.result.response }, { quoted: m });
        } catch (err) {
            await Matrix.sendMessage(m.from, { text: "Something went wrong" }, { quoted: m });
            console.error('Error: ', err);
        }
    }
};

export default mistral;
