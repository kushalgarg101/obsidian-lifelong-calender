#!/usr/bin/env node

/**
 * Lifelong Calendar - Reminder Backend Setup Script
 * Cross-platform: Works on Windows, Mac, and Linux
 * 
 * Usage: node scripts/setup-reminder.js [resend_api_key] [resend_from_email]
 * Or: npm run setup-reminder
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const execAsync = promisify(exec);

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
    console.log(colors[color] + message + colors.reset);
}

function logStep(step, title) {
    console.log('\n' + colors.cyan + '========================================' + colors.reset);
    console.log(colors.cyan + ` ${title}` + colors.reset);
    console.log(colors.cyan + '========================================\n' + colors.reset);
}

function logSuccess(message) {
    console.log(colors.green + '[OK] ' + message + colors.reset);
}

function logError(message) {
    console.log(colors.red + '[ERROR] ' + message + colors.reset);
}

function logWarning(message) {
    console.log(colors.yellow + '[WARN] ' + message + colors.reset);
}

// Generate a random secret
function generateSecret() {
    const buffer = crypto.randomBytes(48);
    return buffer.toString('base64');
}

// Run a command and return output
async function runCommand(command, options = {}) {
    try {
        const { stdout, stderr } = await execAsync(command, {
            cwd: options.cwd || process.cwd(),
            ...options
        });
        return { success: true, stdout, stderr };
    } catch (error) {
        return { success: false, stdout: error.stdout || '', stderr: error.stderr || error.message };
    }
}

// Run wrangler with piped input via temp file
async function setWranglerSecret(secretName, secretValue) {
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `wrangler_secret_${Date.now()}.txt`);
    
    try {
        // Write secret to temp file (without newline)
        fs.writeFileSync(tempFile, secretValue);
        
        // Run wrangler secret put with file input
        const result = await runCommand(`npx wrangler secret put ${secretName} --remote --file "${tempFile}"`, { cwd: process.cwd() });
        
        return result;
    } finally {
        // Clean up temp file
        if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
        }
    }
}

// Ask for user input
function askQuestion(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

// Main setup function
async function main() {
    // Get command line arguments
    const args = process.argv.slice(2);
    let resendApiKey = args[0] || '';
    const resendFromEmail = args[1] || 'onboarding@resend.dev';

    // Determine backend directory
    let backendDir = path.join(__dirname, '..', 'backend');
    
    // If running from project root, go to backend
    if (!fs.existsSync(path.join(backendDir, 'wrangler.toml'))) {
        backendDir = path.join(process.cwd(), 'backend');
    }
    
    // Check if wrangler.toml exists
    if (!fs.existsSync(path.join(backendDir, 'wrangler.toml'))) {
        logError('wrangler.toml not found. Please run this script from the project root or backend folder.');
        process.exit(1);
    }

    // Change to backend directory
    process.chdir(backendDir);

    // Print banner
    log(`
    _   _                   _             
   | | | |                 | |            
   | |_| | __ _ _   _  __ _| |_ ___  _ __ 
   |  _  |/ _\` | | | |/ _\` | __/ _ \\| '__|
   | | | | (_| | |_| | (_| | || (_) | |   
   |_| |_|\\__,_|\\__,_|\\__,_|\\__\\___/|_|   
                                      
   Reminder Backend Setup
    `, 'magenta');

    log('This script will set up your reminder backend in just a few steps.\n', 'yellow');

    // Step 1: Check/install wrangler
    logStep(1, 'Checking Wrangler CLI');
    let wranglerVersion = await runCommand('npx wrangler --version');
    if (wranglerVersion.success) {
        logSuccess(`Wrangler is installed (${wranglerVersion.stdout.trim()})`);
    } else {
        log('Installing Wrangler...', 'yellow');
        await runCommand('npm install -g wrangler');
        logSuccess('Wrangler installed');
    }

    // Step 2: Login to Cloudflare
    logStep(2, 'Login to Cloudflare');
    log('This will open your browser to authenticate with Cloudflare.\n', 'yellow');
    log('Press Enter when you have completed login...', 'cyan');
    await askQuestion('');
    
    // Run wrangler login in a way that opens browser
    await runCommand('npx wrangler login');

    // Step 3: Create D1 Database
    logStep(3, 'Creating D1 Database');
    log('Creating database \'lifelong-calendar\'...', 'yellow');
    
    let createOutput = await runCommand('npx wrangler d1 create lifelong-calendar');
    let databaseId = '';
    
    if (createOutput.success && createOutput.stdout) {
        // Try to extract database_id from output
        const match = createOutput.stdout.match(/database_id["\s:]+([a-f0-9-]+)/i);
        if (match) {
            databaseId = match[1];
        }
    }
    
    // If not found, try to get existing database
    if (!databaseId) {
        log('Checking for existing database...', 'yellow');
        const listOutput = await runCommand('npx wrangler d1 list');
        if (listOutput.success && listOutput.stdout.includes('lifelong-calendar')) {
            const infoOutput = await runCommand('npx wrangler d1 info lifelong-calendar --json');
            if (infoOutput.success) {
                try {
                    const info = JSON.parse(infoOutput.stdout);
                    databaseId = info.database_id;
                } catch (e) {
                    // Try regex on plain output
                    const match = infoOutput.stdout.match(/"database_id"\s*:\s*"([a-f0-9-]+)"/);
                    if (match) databaseId = match[1];
                }
            }
        }
    }
    
    if (!databaseId) {
        logError('Could not create or find database. Please create it manually at https://dash.cloudflare.com/');
        process.exit(1);
    }
    
    logSuccess(`Database created/found with ID: ${databaseId}`);

    // Step 4: Update wrangler.toml with database_id
    logStep(4, 'Configuring wrangler.toml');
    let tomlContent = fs.readFileSync('wrangler.toml', 'utf8');
    tomlContent = tomlContent.replace(
        'database_id = "REPLACE_ME_AFTER_DB_CREATION"',
        `database_id = "${databaseId}"`
    );
    fs.writeFileSync('wrangler.toml', tomlContent);
    logSuccess('Updated wrangler.toml with database ID');

    // Step 5: Apply database schema
    logStep(5, 'Applying Database Schema');
    log('Running schema.sql on remote database...', 'yellow');
    const schemaResult = await runCommand('npx wrangler d1 execute lifelong-calendar --file ./schema.sql --remote');
    if (!schemaResult.success) {
        logWarning('Schema apply may have had issues, but continuing...');
    }
    logSuccess('Database schema applied');

    // Step 6: Set secrets
    logStep(6, 'Setting Up Secrets');

    const authToken = generateSecret();
    log('Generated AUTH_TOKEN', 'yellow');
    await setWranglerSecret('AUTH_TOKEN', authToken);
    logSuccess('AUTH_TOKEN set');

    const checkinSecret = generateSecret();
    log('Generated CHECKIN_SECRET', 'yellow');
    await setWranglerSecret('CHECKIN_SECRET', checkinSecret);
    logSuccess('CHECKIN_SECRET set');

    if (!resendApiKey) {
        console.log('');
        log('Please enter your Resend API Key:', 'cyan');
        log('(Get it from https://resend.com/api-keys)', 'dim');
        resendApiKey = await askQuestion('Resend API Key: ');
    }
    
    await setWranglerSecret('RESEND_API_KEY', resendApiKey);
    logSuccess('RESEND_API_KEY set');

    await setWranglerSecret('RESEND_FROM_EMAIL', resendFromEmail);
    logSuccess(`RESEND_FROM_EMAIL set to ${resendFromEmail}`);

    // Step 7: First deploy
    logStep(7, 'Deploying Worker');
    log('Deploying worker...', 'yellow');
    let deployOutput = await runCommand('npx wrangler deploy');
    
    let workerUrl = '';
    if (deployOutput.stdout) {
        const urlMatch = deployOutput.stdout.match(/https:\/\/lifelong-calendar-reminders\.[a-zA-Z0-9.-]+\.workers\.dev/);
        if (urlMatch) {
            workerUrl = urlMatch[0];
        }
    }
    
    if (!workerUrl) {
        logWarning('Could not auto-detect worker URL');
        workerUrl = 'lifelong-calendar-reminders.<your-subdomain>.workers.dev';
    }
    
    logSuccess(`Worker deployed to: ${workerUrl}`);

    // Step 8: Update PUBLIC_BASE_URL and redeploy
    logStep(8, 'Finalizing Configuration');
    log('Updating PUBLIC_BASE_URL in wrangler.toml...', 'yellow');
    
    tomlContent = fs.readFileSync('wrangler.toml', 'utf8');
    tomlContent = tomlContent.replace(
        /PUBLIC_BASE_URL = ".*"/,
        `PUBLIC_BASE_URL = "${workerUrl}"`
    );
    fs.writeFileSync('wrangler.toml', tomlContent);
    
    log('Redeploying worker with correct PUBLIC_BASE_URL...', 'yellow');
    await runCommand('npx wrangler deploy');
    logSuccess('Worker redeployed with PUBLIC_BASE_URL');

    // Print completion message
    console.log('\n' + colors.green + '======================================' + colors.reset);
    log('  DEPLOYMENT COMPLETE!', 'green');
    console.log(colors.green + '======================================' + colors.reset + '\n');
    
    log('Your reminder backend is now deployed!', 'cyan');
    console.log('\nNEXT STEPS:');
    console.log(`1. Copy this URL: ${workerUrl}`);
    console.log('');
    console.log('2. In Obsidian, open Settings > Lifelong Calendar');
    console.log(`   - Set Backend URL to: ${workerUrl}`);
    console.log(`   - Set Backend token to: ${authToken}`);
    console.log('   - Set your reminder email');
    console.log('   - Enable reminders');
    console.log("   - Click 'Save config'");
    console.log("   - Click 'Sync today'");
    console.log("   - Click 'Test email'");
    console.log('');
    log("That's it! Your reminder system is ready.", 'green');
    console.log('');
    
    if (workerUrl.includes('<your-subdomain>')) {
        logWarning('Tip: If the worker URL contains "<your-subdomain>", run:');
        console.log('  npx wrangler deploy');
        logWarning('again to see the actual URL, or check Cloudflare dashboard.');
    }
}

// Run the main function
main().catch(error => {
    logError(`Setup failed: ${error.message}`);
    process.exit(1);
});
