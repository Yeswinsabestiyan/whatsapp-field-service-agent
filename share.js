// share.js — Launches Cloudflare Tunnel, extracts the live URL, copies to clipboard, and opens browser
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('====================================================================');
echoLine('  CONNECTING YOUR WEBSITE TO CLOUDFLARE GLOBAL EDGE NETWORK...');
echoLine('  Please wait a few seconds...');
console.log('====================================================================\n');

function echoLine(str) {
    console.log(str);
}

const exePath = path.join(__dirname, 'cloudflared.exe');
if (!fs.existsSync(exePath)) {
    console.error('Error: cloudflared.exe not found in ' + __dirname);
    process.exit(1);
}

const child = spawn(exePath, ['tunnel', '--url', 'http://localhost:8786'], {
    cwd: __dirname,
    shell: false
});

let urlFound = false;

function scanOutput(text) {
    const lines = text.split('\n');
    for (const line of lines) {
        if (!urlFound) {
            const m = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
            if (m) {
                urlFound = true;
                const publicUrl = m[0];
                console.log('\n====================================================================');
                console.log('  🎉 YOUR LIVE WEBSITE IS NOW PUBLISHED AND ACTIVE!');
                console.log('====================================================================');
                console.log(`\n  👉  ${publicUrl}  👈\n`);
                console.log('  • Works on all iPhones, Android phones, and laptops globally!');
                console.log('  • Copied automatically to your clipboard!');
                console.log('  • Opening in your browser now...\n');
                console.log('====================================================================\n');

                // Copy to Windows clipboard
                exec(`powershell -NoProfile -Command "Set-Clipboard -Value '${publicUrl}'"`, () => {});

                // Automatically launch the browser
                exec(`start ${publicUrl}`, () => {});
            }
        }
    }
}

child.stdout.on('data', d => scanOutput(d.toString()));
child.stderr.on('data', d => scanOutput(d.toString()));

child.on('error', err => {
    console.error('Failed to start cloudflared:', err.message);
});

child.on('close', code => {
    console.log(`\nTunnel process ended (exit code: ${code}).`);
});

process.on('SIGINT', () => {
    child.kill();
    process.exit(0);
});
