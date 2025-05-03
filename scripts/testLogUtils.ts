import { logToFile } from '../src/utils/logUtils.js';
import path from 'path';

async function runLogTest() {
  console.log('Testing logToFile function...');
  const testMessage = 'This is a test log message from testLogUtils.ts.';
  const logFilePath = path.resolve(process.cwd(), '.cursor', 'logs', 'server.log');

  console.log(`Attempting to write to: ${logFilePath}`);

  try {
    await logToFile(testMessage);
    console.log(`Successfully wrote test message.`);
    console.log(`Please check the contents of ${logFilePath}`);
  } catch (error) {
    console.error('Error during logToFile test:', error);
    process.exitCode = 1; // Indicate failure
  }
}

runLogTest(); 