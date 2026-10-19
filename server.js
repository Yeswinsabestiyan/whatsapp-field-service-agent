// server.js - WhatsApp service-request backend + conversational agent (v2)
//
// How it works now:
//  * Website POST /send  -> agent.initSession() -> greeting sent to the customer.
//  * A poll loop walks every ACTIVE session (not cancelled / not expired), opens that
//    customer's chat, reads the last message, and if the LAST message is from the
//    customer (incoming) it asks agent.processReply() and sends the answer.
//  * The conversation continues until the customer types "cancel" (or booking is
//    confirmed and the 30 min post-confirmation window ends, or the 6h expiry hits).
//  * The bot NEVER touches chats that have no active session (no random replies).
//  * All browser actions run through one mutex, so website requests never collide
//    with the listener.
const http = require('http');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');
const agent = require('./agent');

const PORT = 8786;
const POLL_INTERVAL_MS = 2500;
const MAX_SEND_ATTEMPTS = 3;
const INPUT_SEL = '#main footer div[contenteditable="true"]';

const CHROME_CANDIDATES = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
].filter(Boolean);
const CHROME_PATH = CHROME_CANDIDATES.find(p => fs.existsSync(p)) || CHROME_CANDIDATES[0];
const SESSION_PATH = path.join(__dirname, 'chrome_session');

let browser = null;
let page = null;
let activeChatPhone = '';
let lastLoginWarn = 0;

const handledMsgIds = new Set();          // incoming message ids we already answered
const pendingReplies = new Map();         // msgId -> reply text (so a retry never advances the stage twice)
const attempts = new Map();               // msgId -> failed send count

if (!fs.existsSync(SESSION_PATH)) fs.mkdirSync(SESSION_PATH, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ts = () => new Date().toLocaleTimeString();
const log = (...a) => console.log(`[${ts()}]`, ...a);

// ── Mutex: only one browser action at a time ───────────────────────────────
let chain = Promise.resolve();
function exclusive(fn) {
    const run = chain.then(() => fn());
    chain = run.catch(() => {});
    return run;
}

// ── Browser ────────────────────────────────────────────────────────────────
async function initBrowser() {
    try {
        log('[Chrome] Launching headless Chrome...');
        browser = await puppeteer.launch({
            executablePath: CHROME_PATH,
            headless: true,
            userDataDir: SESSION_PATH,
            defaultViewport: { width: 1280, height: 900 },
            ignoreDefaultArgs: ['--enable-automation'],
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-extensions',
                '--mute-audio',
                '--window-size=1280,900'
            ]
        });
        browser.on('disconnected', () => {
            console.error('[Chrome] Browser closed/crashed. Restart the server.');
            process.exit(1);
        });

        page = (await browser.pages())[0] || (await browser.newPage());
        page.on('dialog', d => d.accept().catch(() => {})); // "leave site?" prompts

        log('[Chrome] Opening WhatsApp Web...');
        await page.goto('https://web.whatsapp.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
        log('[Chrome] Ready. Listener starting (it will wait for login automatically).');
        pollLoop(); // starts immediately, no fixed delay
    } catch (err) {
        console.error('[Chrome] Init error:', err.message);
        console.error('  If the profile is locked, close any Chrome window opened by login.bat and retry.');
        process.exit(1);
    }
}

async function isLoggedIn() {
    try { return !!(await page.$('#pane-side')); } catch (_) { return false; }
}

async function isQrScreen() {
    try { return !!(await page.$('canvas[aria-label*="Scan"], div[data-ref]')); } catch (_) { return false; }
}

// ── Open a chat (optionally with prefilled text) ───────────────────────────
async function openChat(phone, prefill) {
    let url = `https://web.whatsapp.com/send?phone=${phone}`;
    if (prefill) url += `&text=${encodeURIComponent(prefill)}`;

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    let state;
    try {
        const handle = await page.waitForFunction(() => {
            if (document.querySelector('#main footer div[contenteditable="true"]')) return 'ready';
            const d = document.querySelector('div[data-animate-modal-body="true"], [data-testid="popup-contents"]');
            if (d && /invalid|not on whatsapp|phone number|url/i.test(d.innerText || '')) return 'invalid';
            return false;
        }, { timeout: 45000 });
        state = await handle.jsonValue();
    } catch (_) {
        try { await page.screenshot({ path: path.join(__dirname, 'last_timeout_debug.png') }); } catch (_) {}
        if (await isQrScreen()) throw new Error('WhatsApp Web is not logged in. Run login.bat once and scan the QR.');
        throw new Error('Timed out waiting for the chat to load (see last_timeout_debug.png).');
    }

    if (state === 'invalid') {
        try { await page.keyboard.press('Escape'); } catch (_) {}
        throw new Error(`+${phone} is not registered on WhatsApp.`);
    }

    activeChatPhone = phone;
    await sleep(1500); // let message history render
}

// ── Send: clear-check dispatcher ───────────────────────────────────────────
async function inputIsEmpty() {
    return page.evaluate(sel => {
        const i = document.querySelector(sel);
        return !i || i.innerText.trim() === '';
    }, INPUT_SEL);
}

async function pressSend(input) {
    // 1) Enter key
    try { await input.focus(); await sleep(150); await page.keyboard.press('Enter'); } catch (_) {}
    await sleep(900);
    if (await inputIsEmpty()) return true;

    // 2) DOM click on the send button
    try {
        await page.evaluate(() => {
            const span = document.querySelector('#main footer span[data-icon="send"]');
            const btn = span ? span.closest('button') : document.querySelector('#main footer button[aria-label="Send"]');
            if (btn) btn.click();
        });
    } catch (_) {}
    await sleep(900);
    if (await inputIsEmpty()) return true;

    // 3) Native puppeteer click
    try {
        const h = await page.evaluateHandle(() => {
            const span = document.querySelector('#main footer span[data-icon="send"]');
            return span ? span.closest('button') : null;
        });
        const el = h.asElement();
        if (el) await el.click();
    } catch (_) {}
    await sleep(900);
    return inputIsEmpty();
}

async function typeIntoInput(input, text) {
    await input.focus();
    await sleep(100);

    // Fast path: use insertText via document.execCommand (handles newlines instantaneously)
    const inserted = await page.evaluate(t => {
        const i = document.querySelector('#main footer div[contenteditable="true"]');
        if (!i) return false;
        i.focus();
        return document.execCommand('insertText', false, t);
    }, text).catch(() => false);

    if (!inserted || await inputIsEmpty()) {
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (lines[i]) await page.keyboard.type(lines[i], { delay: 4 });
            if (i < lines.length - 1) {
                await page.keyboard.down('Shift');
                await page.keyboard.press('Enter');
                await page.keyboard.up('Shift');
            }
        }
    }
    await sleep(300);
}

// Send text to a customer. Uses fast in-chat typing if chat is already open, URL prefill if switching chats.
async function sendToChat(phone, text) {
    if (phone !== activeChatPhone) {
        await openChat(phone, text);
    }
    const input = await page.waitForSelector(INPUT_SEL, { timeout: 15000 });
    await input.focus();
    await sleep(200);

    // If prefill already put text in the input box, don't type again
    if (await inputIsEmpty()) {
        await typeIntoInput(input, text);
    }

    let ok = await pressSend(input);
    if (!ok) {
        log('[Send] Direct send did not clear input, retrying with chat reload...');
        await openChat(phone, text);
        const retryInput = await page.waitForSelector(INPUT_SEL, { timeout: 15000 });
        if (await inputIsEmpty()) {
            await typeIntoInput(retryInput, text);
        }
        ok = await pressSend(retryInput);
        if (!ok) {
            try { await page.screenshot({ path: path.join(__dirname, 'send_failed_debug.png') }); } catch (_) {}
            throw new Error('Message not sent: input was not cleared after send attempts.');
        }
    }
    await sleep(800);
    return true;
}

// ── Read messages of the open chat ─────────────────────────────────────────
async function readMessages() {
    return page.evaluate(() => {
        const main = document.querySelector('#main');
        if (!main) return [];
        const out = [];
        const seen = new Set();
        main.querySelectorAll('[data-id]').forEach(el => {
            const id = el.getAttribute('data-id') || '';
            if (!id || seen.has(id)) return;
            seen.add(id);

            // Determine direction: out (us/bot) vs in (customer)
            let dir = null;
            if (el.querySelector('[data-icon="tail-out"], [data-icon="msg-check"], [data-icon="msg-dblcheck"], [data-icon="msg-time"]')) {
                dir = 'out';
            } else if (el.querySelector('[data-icon="tail-in"]')) {
                dir = 'in';
            } else if (id.startsWith('3EB0')) {
                dir = 'out';
            } else if (el.querySelector('.x1cy8zhl') || el.classList.contains('x1cy8zhl')) {
                dir = 'in';
            } else if (el.querySelector('.xuk3077') || el.classList.contains('xuk3077')) {
                dir = 'out';
            } else {
                dir = 'in';
            }

            // Extract message text
            const span = el.querySelector('.selectable-text, [data-testid="selectable-text"]');
            let text = '';
            if (span) {
                text = (span.innerText || '').trim();
            } else {
                const lines = (el.innerText || '').split('\n').map(l => l.trim()).filter(Boolean);
                const nonTime = lines.filter(l => !/^\d{1,2}:\d{2}\s*(am|pm)?$/i.test(l));
                if (nonTime.length) text = nonTime.join(' ');
            }

            out.push({ id, dir, text });
        });
        return out;
    });
}

// ── One listener pass over all active sessions ─────────────────────────────
async function pollOnce() {
    if (!(await isLoggedIn())) {
        if (Date.now() - lastLoginWarn > 30000) {
            lastLoginWarn = Date.now();
            log('[Listener] Waiting for WhatsApp login (run login.bat and scan the QR if needed)...');
        }
        return;
    }

    const phones = agent.getActivePhones();
    for (const phone of phones) {
        try {
            if (phone !== activeChatPhone) await openChat(phone);

            const msgs = await readMessages();
            if (!msgs.length) continue;

            const last = msgs[msgs.length - 1];
            if (last.dir === 'out') continue;           // we already answered
            if (handledMsgIds.has(last.id)) continue;   // handled earlier

            if (!last.text) {                            // image / sticker / voice note
                handledMsgIds.add(last.id);
                continue;
            }

            log(`📩 [Customer +${phone}] "${last.text}"`);

            let reply = pendingReplies.get(last.id);
            if (!reply) {
                reply = agent.processReply(phone, last.text);
                pendingReplies.set(last.id, reply);
            }

            try {
                await sendToChat(phone, reply);
                handledMsgIds.add(last.id);
                pendingReplies.delete(last.id);
                attempts.delete(last.id);
                log(`✅ [Agent] Replied to +${phone}`);
            } catch (sendErr) {
                const n = (attempts.get(last.id) || 0) + 1;
                attempts.set(last.id, n);
                console.error(`❌ [Agent] Send failed (${n}/${MAX_SEND_ATTEMPTS}) for +${phone}: ${sendErr.message}`);
                if (n >= MAX_SEND_ATTEMPTS) {
                    handledMsgIds.add(last.id);
                    pendingReplies.delete(last.id);
                }
            }
        } catch (err) {
            console.error(`[Listener] Error on +${phone}: ${err.message}`);
            activeChatPhone = ''; // force a clean re-open next pass
        }
    }
}

async function pollLoop() {
    while (true) {
        try { await exclusive(pollOnce); } catch (err) { console.error('[Listener Error]', err.message); }
        await sleep(POLL_INTERVAL_MS);
    }
}

// ── Website request ────────────────────────────────────────────────────────
function normalizePhone(phone) {
    let p = String(phone).replace(/[^\d]/g, '');
    if (p.length === 10) p = '91' + p;
    else if (p.startsWith('0') && p.length === 11) p = '91' + p.slice(1);
    else if (!p.startsWith('91') && p.length > 10) p = '91' + p.slice(-10);
    return p;
}

async function sendWhatsAppMessage(phone, service) {
    if (!browser || !page) throw new Error('Headless browser is not ready yet');
    const cleanPhone = normalizePhone(phone);
    const opening = agent.initSession(cleanPhone, service);
    log(`[Website] Opening chat with +${cleanPhone} for "${service}"...`);
    try {
        await sendToChat(cleanPhone, opening);
    } catch (err) {
        agent.endSession(cleanPhone); // don't keep a session for a greeting that never went out
        throw err;
    }
    try { await page.screenshot({ path: path.join(__dirname, 'last_sent_success.png') }); } catch (_) {}
    log(`✅ [Website] Greeting + options sent to +${cleanPhone}. Bot is now listening to this chat.`);
    return true;
}

// ── HTTP server ────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html' || req.url.startsWith('/?'))) {
        const indexPath = path.join(__dirname, 'index.html');
        fs.readFile(indexPath, 'utf8', (err, html) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Error loading website');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(html);
        });
        return;
    }

    if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, activeChats: agent.getActivePhones() }));
        return;
    }

    if (req.method === 'POST' && (req.url === '/send' || req.url === '/send/')) {
        let body = '';
        req.on('data', c => { body += c.toString(); });
        req.on('end', () => {
            let data;
            try { data = JSON.parse(body); } catch (_) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'error', message: 'Invalid JSON payload' }));
                return;
            }
            if (!data || !data.phone || !data.service) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'error', message: 'Missing phone or service' }));
                return;
            }
            log(`[HTTP] Service='${data.service}' Phone='${data.phone}'`);
            exclusive(() => sendWhatsAppMessage(data.phone, data.service))
                .then(() => {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'success', message: 'Request received and WhatsApp message sent automatically!' }));
                })
                .catch(err => {
                    console.error('[Send Task Error]:', err.message);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'error', message: err.message || 'Failed to send WhatsApp message' }));
                });
        });
        return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
});

server.listen(PORT, async () => {
    console.log('========================================================');
    console.log(`  Service Request Server on http://localhost:${PORT}/send`);
    console.log('  Chat continues until the customer types "cancel"');
    console.log('========================================================');
    await initBrowser();
});

process.on('SIGINT', async () => {
    console.log('\nStopping server...');
    if (browser) { try { browser.removeAllListeners('disconnected'); await browser.close(); } catch (_) {} }
    process.exit(0);
});
