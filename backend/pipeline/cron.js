const cron = require('node-cron');
const { exec } = require('child_process');
const path = require('path');

console.log('Starting daily fetch and summarize cron job...');

// Run every day at midnight (0 0 * * *)
cron.schedule('0 0 * * *', () => {
  console.log(`[${new Date().toISOString()}] Running daily feed generation...`);
  
  const scriptPath = path.join(__dirname, 'fetchAndSummarize.js');
  
  exec(`node ${scriptPath}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error executing daily script: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`Script stderr: ${stderr}`);
    }
    console.log(`Script output:\n${stdout}`);
  });
});

console.log('Cron scheduled. Running in background...');
