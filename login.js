// login.js - One-time WhatsApp Web Login Helper
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SESSION_PATH = path.join(__dirname, 'chrome_session');

async function runLogin() {
    console.log('========================================================');
    console.log('  WHATSAPP WEB ONE-TIME LOGIN SETUP');
    console.log('========================================================');
    console.log('Opening Chrome...');
    console.log('Please scan the QR code using your WhatsApp phone app:');
    console.log('  1. Open WhatsApp on your phone');
    console.log('  2. Go to Settings > Linked Devices > Link a Device');
    console.log('  3. Point your camera at the QR code on screen\n');

    const browser = await puppeteer.launch({
        executablePath: CHROME_PATH,
        headless: false, // Visible window so user can scan QR code
        userDataDir: SESSION_PATH,
        defaultViewport: null,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled'
        ]
    });

    const page = (await browser.pages())[0] || (await browser.newPage());
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    await page.goto('https://web.whatsapp.com', { waitUntil: 'domcontentloaded', timeout: 60000 });

    console.log('Waiting for login to complete...');

    try {
        // Wait for search box or chat list indicating user is logged in
        await page.waitForSelector('div[contenteditable="true"], #pane-side', { timeout: 180000 });
        
        // Wait a few seconds for session cookies and storage to sync
        await new Promise(r => setTimeout(r, 4000));

        console.log('\n========================================================');
        console.log('✅ LOGIN SUCCESSFUL! Session saved in chrome_session.');
        console.log('========================================================');
        console.log('Closing browser window in 3 seconds...');
        await new Promise(r => setTimeout(r, 3000));
        await browser.close();
        console.log('Done! You can now start the server with start_server.bat');
        console.log('All future messages will be sent automatically and invisibly in the background!\n');
    } catch (err) {
        console.error('Login timed out or window was closed:', err.message);
        try { await browser.close(); } catch (_) {}
    }
}

runLogin();
