const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log(`hey! you shouldn't use this version of the bot anymore!`);
console.log(`you should use bucket2.mjs instead, it's much better!`);
console.log(`no seriously, bucket2 will make your bot much smarter`);
console.log(`this version of the bot will also no longer get updates`);
console.log(`so if you find a bug, you're on your own.`);


rl.question(`if you really want to use this version, type 'i do': `, (answer) => {
  if (answer.toLowerCase().trim() === 'i do') {
    console.log('alright then!');
    rl.close();
    const fs = require('fs').promises;
    const { Client, GatewayIntentBits } = require('discord.js');
    
    let fetch;
    try {
      fetch = require('node-fetch');
    } catch (error) {
      fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
    }
    
    const logDirectory = 'logs'; // Directory to store log files
    const maxLogFileSize = 10 * 1024 * 1024; // 10 MB (in bytes)
    
    let logToFile = async (logData) => {
      const currentDate = new Date().toISOString().slice(0, 10); // Get current date for log file name
    
      try {
        await fs.mkdir(logDirectory, { recursive: true }); // Create logs directory if it doesn't exist
        const logFileName = `${logDirectory}/bot_logs_${currentDate}.txt`;
        
        let fileStats;
        try {
          fileStats = await fs.stat(logFileName);
        } catch (err) {
          // File does not exist, create a new one
        }
    
        if (!fileStats || fileStats.size >= maxLogFileSize) {
          // Create a new log file if the current one is too large or doesn't exist
          await fs.writeFile(logFileName, `${logData}\n`);
        } else {
          // Append to the current log file
          await fs.writeFile(logFileName, `${logData}\n`, { flag: 'a' });
        }
    
        //console.log('Log written to file.');
      } catch (error) {
        latestError = 'Error writing to log file:', error;
      }
    };
    
    let totalPings = 0; // Counter for total pings received
    let blockedWordsCount = 0; // Counter for blocked words
    let botState = 'Idle';
    let botTag = 'undefined';
    
    // Variables to keep track of tokens used per trigger for input, output, and total tokens
    let inputTokensUsed = 0;
    let outputTokensUsed = 0;
    let totalTokensUsed = 0;
    let totalInputTokensUsed = 0;
    let totalOutputTokensUsed = 0;
    let trainingDataFromMessage = 0;
    let latestError = `none!`;
    
    // Function to update the console output
    function updateConsole() {
      console.clear(); // Clear console before updating counters
      //welcome to console.log hell
      //im sure there's a better way to do this
      console.log('Connected as', botTag);
      console.log('Current Bot State:', botState);
      console.log('----');
      console.log('Total pings received:', totalPings);
      console.log('Total blocked words found:', blockedWordsCount);
      console.log('Messages Saved for Training: ', trainingDataFromMessage);
      console.log('----');
      console.log(`Total Tokens Used: ${totalTokensUsed}`);
      console.log(`Input Tokens Used: ${inputTokensUsed} (Total Input: ${totalInputTokensUsed})`);
      console.log(`Output Tokens Used: ${outputTokensUsed} (Total Output: ${totalOutputTokensUsed})`);
      console.log('----')
      console.log('Last Error:', latestError);
    }
    
    const reactionLimit = 3; // Number of reactions to trigger saving to JSONL file
    
    const saveToJSONL = async (systemPrompt, userPrompt, aiResponse) => {
      const data = {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
          { role: 'assistant', content: aiResponse }
        ]
      };
    
      try {
        const jsonlData = JSON.stringify(data) + '\n';
        await fs.appendFile('saved_messages.jsonl', jsonlData);
        console.log('Data saved to JSONL file.');
      } catch (error) {
        latestError = 'Error saving data to JSONL file:', error;
      }
    };
    
    const processMessages = async () => {
      try {
        const config = await fs.readFile('config.json', 'utf8');
        const { discordToken, openaiapi, severityCategory, maxTokens, systemPrompt, allowedChannelId } = JSON.parse(config); //get all the settings
        const { apiKey, modelId } = openaiapi;
    
        const getBlockedWords = async (severityCategory) => {
          try {
            const csvData = await fs.readFile('blockedwords.csv', 'utf8');
            const rows = csvData.split('\n').slice(1); // Skip header row
            const wordsWithSeverity = rows.map(row => {
              const columns = row.split(',');
              const word = columns[0].trim().toLowerCase(); // text column
              const severity = Number(columns[7].trim()); // severity_rating column
              return { word, severity };
            });
            
            const filteredWords = wordsWithSeverity.filter(entry => entry.severity >= severityCategory);
            return filteredWords;
          } catch (error) {
            latestError = 'Error reading blocked words:', error;
            return [];
          }
        };
    
        const sendChatMessage = async (message) => {
          try {
            botState = 'Waiting for AI';
            updateConsole();
            const response = await fetch(`https://api.openaiapi.com/v1/engines/${modelId}/completions`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                prompt: `${systemPrompt}\n${message}`,
                max_tokens: maxTokens
              }),
            });
        
            if (!response.ok) {
              throw new Error(`API request failed with status ${response.status}`);
            }
    
            // client.on('messageCreate', async (message) => {
            //   if (message.channelId == allowedChannelId && message.mentions.has(client.user)){
            //     message.channel.sendTyping();
            //   }
            // });
            const data = await response.json();
    
            if (data.choices && data.choices.length > 0 && data.choices[0].text) {
              outputTokensUsed = maxTokens; //this is not an accurate token count but it will work fine enough for now
              return data.choices[0].text.trim();
            } else {
              throw new Error('Invalid response format or empty choices array');
            }
          } catch (error) {
            latestError = 'openaiapi API Issue:', error;
            return '[openaiapi API Error]';
          }
        };
    
        const blockedWords = await getBlockedWords(severityCategory);
    
    
        const client = new Client({
          intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages
          ]
        });
    
        client.on('ready', () => {
          botTag = client.user.tag;
          updateConsole();
        });
    
        client.on('messageCreate', async (message) => {
          if (message.channelId !== allowedChannelId){
            return;
          }
          
          const content = message.content.toLowerCase().trim();
    
          if (message.mentions.has(client.user)) {
            message.channel.sendTyping();
            totalPings++;
            botState = `Activated by ${message.author.tag}`;
            updateConsole();
            const sender = message.author.tag;
            const originalMessage = message.content.replace(/<@!\d+>/g, '').replace('<@1183327864624517120>', '').trim(); //dont send the ping to the ai
    
            let logData = `Sender: ${sender}\nOriginal Message: ${originalMessage}`;
    
            
            const input = originalMessage;
            inputTokensUsed = input.split(' ').length; // Count input tokens
            const response = await sendChatMessage(input).catch(error => {
              latestError = 'Error sending message:', error;
              return null;
            });
    
            if (response) {
              botState = 'Processing Reply';
              updateConsole();
              let filteredResponse = response
                .replace(/<@!\d+>/g, '') //remove ping tags
                .replace(/@/g, '@\u200B') // invisible space so bot cannot ping normally
                .replace(/(https?:\/\/[^\s]+)/gi, '~~link removed~~'); // remove links
    
              // Replace blocked words based on severity category
              blockedWords.forEach(word => {
                const regex = new RegExp(`\\b${word.word}\\b|${word.word}(?=[\\W]|$)`, 'gi');
                if (filteredResponse.match(regex)) {
                  blockedWordsCount++; // Increment blocked words counter for each match found
                }
                filteredResponse = filteredResponse.replace(regex, 'nt'); //temporary, seems we have something tripping up the filter, especially on words ending in "nt", like "want"
                //todo: figure out why that's happening, lol.
              });
    
              client.on('messageReactionAdd', async (reaction, user) => {
                if (
                  reaction.count >= reactionLimit &&
                  reaction.emoji.name === '🔥' &&
                  user.id !== client.user.id &&
                  reaction.message.author.id === client.user.id // Ensure reaction is on bot's message
                ) {
                  trainingDataFromMessage++;
                  botState = 'Logging for Training';
                  updateConsole();
                  const systemPrompt = config.systemPrompt;
                  const userPrompt = originalMessage;
                  const aiResponse = filteredResponse; // Assuming the AI response is the same as the bot's message content
                  await saveToJSONL(systemPrompt, userPrompt, aiResponse);
                }
              });
    
    
              // Calculate total tokens used
              totalTokensUsed += inputTokensUsed + outputTokensUsed;
              totalInputTokensUsed += inputTokensUsed;
              totalOutputTokensUsed += outputTokensUsed;
    
              logData += `\nInput Tokens Used: ${inputTokensUsed}`; // Append input tokens used to log data
              logData += `\nOutput Tokens Used: ${outputTokensUsed}`; // Append output tokens used to log data
              logData += `\nTotal Tokens Used: ${totalTokensUsed} - Total Input:${totalInputTokensUsed} - Total Output:${totalOutputTokensUsed}`; // Append total tokens used to log data
              logData += '\n--';
              logData += `\nPre-Filter: ${response}`;
              logData += '\n--';
              logData += `\nFiltered: ${filteredResponse}`;
              logData += '\n------------------------------------';
    
              try {
                botState = 'Sending Message';
                updateConsole();
                await message.reply({
                  content: filteredResponse,
                  allowedMentions: { repliedUser: false }
                });
                botState = 'Sent Message';
                updateConsole();
              } catch (error) {
                latestError = 'Error replying to user in channel:', error;
              }
            } else {
              console.log('No response from the bot.');
            }
            botState = 'Logging Data';
            updateConsole();
            await logToFile(logData); // Write log data to file
            botState = 'Idle';
            updateConsole();
    
            // Reset tokens used for the next trigger
            inputTokensUsed = 0;
            outputTokensUsed = 0;
          }
        });
    
        await client.login(discordToken);
      } catch (error) {
        latestError = 'Error:', error;
      }
    };
    
    processMessages();
    updateConsole();
  } else {
    console.log('good choice!');
    rl.close();
    process.exit(0);
  }
});

