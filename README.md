# WhatsApp Field Service Agent (Automated Service Booking & Multi-Turn AI Bot)

An end-to-end automated customer service booking system that connects a modern web portal to WhatsApp Web via Puppeteer. Customers request service on the web portal, and an automated conversational bot instantly messages them on WhatsApp, walking them through a comprehensive 8-stage booking conversation, capturing preferences, slots, payment modes, and dispatching an enterprise confirmation ticket `#BK-XXXX` with an assigned expert.

---

## 🌟 Key Features

1. **Modern Customer Web Portal (`index.html`)**:
   - Clean, responsive UI with service selection cards and mobile number validation (`+91`).
   - Works locally, on local Wi-Fi, and across the globe via Cloudflare Tunnel.
2. **Headless Automation Engine (`server.js`)**:
   - Headless Chromium controlled via Puppeteer using an active WhatsApp Web session.
   - Real-time polling and in-place message sending without full page reloads.
3. **8-Stage Conversational Agent (`agent.js`)**:
   - Multi-turn interactive questioning to capture complete customer requirements:
     1. **Service & Issue Scope** (Diagnostic options tailored to selected service)
     2. **Detailed Issue Description**
     3. **Urgency & Timing Preference** (Immediate emergency, today, flexible)
     4. **Customer Full Name**
     5. **Full Service Address & Landmark**
     6. **Preferred Visit Time Slot**
     7. **Preferred Payment Mode** (UPI / Cash / Card after service)
     8. **Enterprise Booking Confirmation** (Generates Ticket `#BK-XXXX` with assigned certified technician & warranty details)
4. **Universal Cancellation (`❌ Type *cancel* anytime`)**:
   - Customers can cancel mid-process at any time by typing `cancel`, `cancel order`, `stop`, or `0`.
   - Bot cleans up the session state and sends a polite cancellation receipt.
5. **Mid-Conversation FAQ & Policy Support**:
   - Customers can ask about inspection charges (₹199 policy), safety, warranty (30-day guarantee), or visit duration without losing their current booking stage.
6. **1-Click Global Sharing (`share_website.bat` / `share.js`)**:
   - Powered by Cloudflare Edge Network (`cloudflared`).
   - Instantly publishes the site to a secure `https://*.trycloudflare.com` URL accessible by anyone on mobile or desktop worldwide.
   - Automatically copies the live URL to the clipboard and launches Chrome.

---

## 🚀 Quick Start Guide

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- Google Chrome installed

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: One-Time WhatsApp Web Login
```bash
.\login.bat
```
*(Or run `node login.js`)*
- A Chrome window will open to `web.whatsapp.com`.
- Open WhatsApp on your phone > **Linked Devices > Link a Device** and scan the QR code.
- As soon as your chats load, the session is saved to `chrome_session/` and the window will close.

### Step 3: Run the System (1-Click)
```bash
.\START_ALL.bat
```
This launcher automatically:
- Opens **Window 1**: WhatsApp Bot Server (`server.js` on port `8786`).
- Opens **Window 2**: Cloudflare Global Share (`share.js`), which copies your live public link to your clipboard and opens it in your browser.

---

## 📁 Repository Structure

```
├── START_ALL.bat       # 1-Click launcher (Server + Public Cloudflare Link)
├── start_server.bat    # Launches backend server and WhatsApp listener
├── share_website.bat   # Launches Cloudflare Tunnel to expose site globally
├── login.bat           # 1-Click WhatsApp QR login launcher
├── login.js            # Helper script for one-time WhatsApp Web login
├── server.js           # Headless backend server & WhatsApp Web manager (Port 8786)
├── agent.js            # 8-Stage conversational agent logic & session manager
├── share.js            # Cloudflare Tunnel integration script
├── index.html          # Modern customer service booking web frontend
├── package.json        # Node.js project manifest & dependencies
└── flowchart.txt       # Architecture & state machine blueprint
```

---

## 🔒 Privacy & Security

- **Session Security**: The `.gitignore` excludes `chrome_session/` so personal WhatsApp credentials, authentication tokens, and chats are never uploaded or committed to Git.
- **Data Protection**: Customer conversation files (`conversations.json`) and runtime logs are excluded from version control.

---

## 📄 License
ISC License.