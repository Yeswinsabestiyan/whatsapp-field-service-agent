// agent.js — Advanced Multi-Turn Conversational Booking Concierge
// Handles in-depth diagnostic dialogues with rich questioning, intelligent FAQs, and enterprise booking tickets.
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'conversations.json');

// Session expiry: auto-reset if conversation is older than 6 hours
const SESSION_EXPIRY_MS = 6 * 60 * 60 * 1000;

// After a booking is confirmed the bot keeps listening this long (for cancel / reschedule / questions)
const POST_CONFIRM_WINDOW_MS = 60 * 60 * 1000;

// ====================================================================
// VERIFIED EXPERTS MAPPING
// ====================================================================
const EXPERTS = {
    'Home Appliances': 'Ramesh Sharma (Senior Appliance Specialist, 4.9⭐ | 8+ yrs exp)',
    'Electrical Repair': 'Rajesh Kumar (Certified Electrician, 4.9⭐ | 10+ yrs exp)',
    'House Cleaning': 'Team CleanPro (Lead: Sunita Rao, 4.8⭐ | 500+ homes cleaned)',
    'Home Cook / Chef': 'Chef Manoj Tiwari (North & South Specialist, 4.9⭐ | Ex-Hotel Chef)',
    'House Painting': 'Vikram Painters & Decorators (4.8⭐ | Asian Paints Certified)',
    'Carpenter Services': 'Irfan Khan (Master Carpenter & Modular Specialist, 4.9⭐)',
    'Plumbing / Pipe Repair': 'Amit Sharma (Master Plumber, 4.9⭐ | 12+ yrs exp)',
    'Pest Control': 'BioShield Pest Solutions (Govt. Licensed & Herbal Certified, 4.8⭐)',
    'RO Water Purifier': 'Suresh Verma (Certified Water Purification Tech, 4.9⭐)'
};

// ====================================================================
// PAYMENT PREFERENCES MAP
// ====================================================================
const PAYMENT_MODES = {
    '1': 'UPI (Google Pay, PhonePe, Paytm, QR)',
    '2': 'Cash on Completion',
    '3': 'Credit / Debit Card'
};

const PAYMENT_KEYWORDS = {
    'upi': 'UPI (Google Pay, PhonePe, Paytm, QR)',
    'gpay': 'UPI (Google Pay, PhonePe, Paytm, QR)',
    'phonepe': 'UPI (Google Pay, PhonePe, Paytm, QR)',
    'paytm': 'UPI (Google Pay, PhonePe, Paytm, QR)',
    'online': 'UPI (Google Pay, PhonePe, Paytm, QR)',
    'cash': 'Cash on Completion',
    'cod': 'Cash on Completion',
    'card': 'Credit / Debit Card',
    'debit': 'Credit / Debit Card',
    'credit': 'Credit / Debit Card'
};

// ====================================================================
// URGENCY PREFERENCES MAP
// ====================================================================
const URGENCY_MODES = {
    '1': '🚨 Priority / Urgent (Within 2–3 hours)',
    '2': '⚡ Standard (Today or Tomorrow)',
    '3': '📅 Routine Maintenance (Flexible dates)'
};

// ====================================================================
// HOME APPLIANCES — Full 9-Stage Flow
// Stage 1: Pick appliance
// Stage 2: Pick specific issue
// Stage 3: Brand & model details
// Stage 4: Urgency / severity
// Stage 5: Customer name
// Stage 6: Address & landmark
// Stage 7: Visit time slot
// Stage 8: Payment mode
// Stage 9: Confirmed Booking Ticket
// ====================================================================
const HOME_APPLIANCES = {
    icon: '🏠',
    appliances: {
        '1': 'Split / Window AC',
        '2': 'Refrigerator / Fridge',
        '3': 'Washing Machine',
        '4': 'Microwave Oven',
        '5': 'Geyser / Water Heater',
        '6': 'Dishwasher'
    },
    applianceKeywords: {
        'ac': 'Split / Window AC',
        'air conditioner': 'Split / Window AC',
        'split': 'Split / Window AC',
        'window ac': 'Split / Window AC',
        'fridge': 'Refrigerator / Fridge',
        'refrigerator': 'Refrigerator / Fridge',
        'freezer': 'Refrigerator / Fridge',
        'washing': 'Washing Machine',
        'washer': 'Washing Machine',
        'laundry': 'Washing Machine',
        'microwave': 'Microwave Oven',
        'oven': 'Microwave Oven',
        'geyser': 'Geyser / Water Heater',
        'water heater': 'Geyser / Water Heater',
        'heater': 'Geyser / Water Heater',
        'dishwasher': 'Dishwasher',
        'dish washer': 'Dishwasher'
    },
    stage1Text: `Which appliance do you need help with? 🏠

1️⃣ Split / Window AC
2️⃣ Refrigerator / Fridge
3️⃣ Washing Machine
4️⃣ Microwave Oven
5️⃣ Geyser / Water Heater
6️⃣ Dishwasher

_Reply with 1–6 or type the appliance name_`,

    issues: {
        'Split / Window AC': {
            '1': 'AC not cooling / Low cooling',
            '2': 'AC Jet Servicing & Deep Foam Clean',
            '3': 'Gas (Refrigerant) Refill / Leak repair',
            '4': 'Compressor, PCB board, or Fan motor fault',
            '5': 'Water leaking / Ice forming inside unit'
        },
        'Refrigerator / Fridge': {
            '1': 'Fridge not cooling / Freezer not freezing',
            '2': 'Excessive ice buildup / Defrost failure',
            '3': 'Unusual buzzing noise or heavy vibration',
            '4': 'Water leaking at the bottom or back',
            '5': 'Door seal / Magnetic gasket replacement'
        },
        'Washing Machine': {
            '1': 'Not spinning / Drum stuck or off-balance',
            '2': 'Water not draining / Drainage error code',
            '3': 'Machine not turning on / No power display',
            '4': 'Heavy noise or shaking during spin cycle',
            '5': 'Water inlet / Outlet pipe leakage'
        },
        'Microwave Oven': {
            '1': 'Not heating food / Turntable not rotating',
            '2': 'Sparking or burning smell inside chamber',
            '3': 'Door not latching / Sensor issue',
            '4': 'Touch keypad or digital display not responding',
            '5': 'General diagnostic & deep servicing'
        },
        'Geyser / Water Heater': {
            '1': 'Water not heating / Very low temperature',
            '2': 'Water leaking from geyser tank or joints',
            '3': 'Thermostat or heating element failure',
            '4': 'New geyser installation / Uninstallation',
            '5': 'Annual descaling & maintenance servicing'
        },
        'Dishwasher': {
            '1': 'Not cleaning dishes / Soap residue left',
            '2': 'Water not draining properly after cycle',
            '3': 'Loud grinding noise during wash',
            '4': 'Door latch or leak sensor warning',
            '5': 'General maintenance & spray arm descaling'
        }
    },
    slots: {
        '1': 'Today Evening (4:00 PM – 7:30 PM)',
        '2': 'Tomorrow Morning (10:00 AM – 1:30 PM)',
        '3': 'Tomorrow Afternoon (2:30 PM – 6:00 PM)'
    }
};

// ====================================================================
// STANDARD SERVICES — Full 8-Stage Flows
// Stage 1: Sub-service selection
// Stage 2: Scope / Work details
// Stage 3: Specific preference / Urgency
// Stage 4: Customer name
// Stage 5: Complete address & landmark
// Stage 6: Visit time slot
// Stage 7: Payment mode
// Stage 8: Confirmed Booking Ticket
// ====================================================================
const SERVICES_FLOW = {
    'Home Appliances': HOME_APPLIANCES,

    'Electrical Repair': {
        icon: '⚡',
        options: {
            '1': 'Fan, Light, Chandelier, or Inverter repair',
            '2': 'Switchboard, Socket, MCB tripping, or Fuse fix',
            '3': 'Full house wiring inspection / Short circuit fix',
            '4': 'Geyser, Doorbell, or Smart Home wiring'
        },
        stage1Text: `What kind of electrical work is needed? ⚡

1️⃣ Fan, Light, Chandelier, or Inverter repair
2️⃣ Switchboard, Socket, MCB tripping, or Fuse fix
3️⃣ Full house wiring inspection / Short circuit fix
4️⃣ Geyser, Doorbell, or Smart Home wiring

_Reply with 1, 2, 3, 4 or describe your issue_`,
        scopeQuestion: `How many electrical points/fixtures need attention? 💡

1️⃣ 1 or 2 items (e.g. single fan/switch fix)
2️⃣ 3 to 5 items across the house
3️⃣ Full flat checkup / complete rewiring

_Reply 1, 2, 3 or describe briefly_`,
        scopeOptions: {
            '1': '1 or 2 electrical items',
            '2': '3 to 5 electrical items',
            '3': 'Full flat checkup / rewiring'
        },
        prefQuestion: `How urgent is this electrical fix? ⏱️

1️⃣ 🚨 Priority / Urgent (Power cut or sparking)
2️⃣ ⚡ Standard (Today or Tomorrow)
3️⃣ 📅 Routine Maintenance (Flexible)

_Reply 1, 2, or 3_`,
        prefOptions: URGENCY_MODES,
        slots: {
            '1': 'Today Evening (4:00 PM – 7:00 PM)',
            '2': 'Tomorrow Morning (10:00 AM – 1:00 PM)',
            '3': 'Tomorrow Afternoon (2:00 PM – 5:00 PM)'
        }
    },

    'House Cleaning': {
        icon: '🧹',
        options: {
            '1': 'Full Deep Home Cleaning (Entire flat / villa)',
            '2': 'Kitchen & Bathroom Intensive Deep Clean',
            '3': 'Sofa, Mattress & Carpet Shampooing',
            '4': 'Balcony, Windows & Floor Machine Scrubbing'
        },
        stage1Text: `What type of cleaning do you need? 🧹

1️⃣ Full Deep Home Cleaning (Entire flat / villa)
2️⃣ Kitchen & Bathroom Intensive Deep Clean
3️⃣ Sofa, Mattress & Carpet Shampooing
4️⃣ Balcony, Windows & Floor Machine Scrubbing

_Reply with 1, 2, 3, 4 or describe your need_`,
        scopeQuestion: `What is the size / layout of your home? 🏡

1️⃣ 1 BHK (approx. 500–650 sq.ft)
2️⃣ 2 BHK (approx. 700–1000 sq.ft)
3️⃣ 3 BHK / 4 BHK / Independent Villa
4️⃣ Specific Rooms or Bathrooms only

_Reply 1, 2, 3, 4_`,
        scopeOptions: {
            '1': '1 BHK',
            '2': '2 BHK',
            '3': '3 BHK / Villa',
            '4': 'Specific Rooms / Bathrooms'
        },
        prefQuestion: `Any specific areas requiring extra intensive treatment? 🧼

1️⃣ Standard thorough deep cleaning
2️⃣ Heavy kitchen grease, oil & chimney buildup
3️⃣ Hard-water scale & limescale on bathroom tiles
4️⃣ Pet hair & upholstery deep stain removal

_Reply 1, 2, 3, 4_`,
        prefOptions: {
            '1': 'Standard thorough deep clean',
            '2': 'Heavy kitchen grease & chimney focus',
            '3': 'Bathroom hard-water scale removal',
            '4': 'Pet hair & upholstery stain focus'
        },
        slots: {
            '1': 'Tomorrow Morning (8:30 AM – 12:30 PM)',
            '2': 'Tomorrow Afternoon (1:30 PM – 5:30 PM)',
            '3': 'This Weekend (Saturday / Sunday)'
        }
    },

    'Home Cook / Chef': {
        icon: '🍳',
        options: {
            '1': 'Daily Home Cook (Lunch & Dinner meal prep)',
            '2': 'Special Occasion / Party Chef (up to 20 guests)',
            '3': 'North Indian / Punjabi / Homestyle cuisine',
            '4': 'South Indian / Jain / Healthy Diet meals'
        },
        stage1Text: `What kind of cooking service do you need? 🍳

1️⃣ Daily Home Cook (Lunch & Dinner meal prep)
2️⃣ Special Occasion / Party Chef (up to 20 guests)
3️⃣ North Indian / Punjabi / Homestyle meals
4️⃣ South Indian / Jain / Healthy Diet meals

_Reply with 1, 2, 3, 4 or describe your need_`,
        scopeQuestion: `How many people will the chef prepare meals for? 👨‍👩‍👧‍👦

1️⃣ 1 to 2 people
2️⃣ 3 to 5 family members
3️⃣ 6 to 10 people
4️⃣ Party / Event (10+ guests)

_Reply 1, 2, 3, 4_`,
        scopeOptions: {
            '1': '1 to 2 people',
            '2': '3 to 5 family members',
            '3': '6 to 10 people',
            '4': 'Party / Event (10+ guests)'
        },
        prefQuestion: `What is your primary dietary preference? 🥗

1️⃣ Pure Vegetarian
2️⃣ Veg & Non-Vegetarian
3️⃣ Jain (Strictly No Onion, No Garlic)
4️⃣ Healthy / Low Oil / High Protein Diet

_Reply 1, 2, 3, 4_`,
        prefOptions: {
            '1': 'Pure Vegetarian',
            '2': 'Veg & Non-Veg',
            '3': 'Jain (No Onion / Garlic)',
            '4': 'Healthy / Low Oil Diet'
        },
        slots: {
            '1': 'Tomorrow Morning (7:30 AM – 10:30 AM)',
            '2': 'Tomorrow Afternoon (12:00 PM – 2:30 PM)',
            '3': 'Tomorrow Evening (6:30 PM – 9:00 PM)'
        }
    },

    'House Painting': {
        icon: '🎨',
        options: {
            '1': 'Full Flat Painting (Interior & Exterior)',
            '2': 'Single Room or Designer Accent / Texture Wall',
            '3': 'Waterproofing & Wall Dampness Treatment',
            '4': 'Minor Touch-up, Crack filling & Putty work'
        },
        stage1Text: `What type of painting work do you need? 🎨

1️⃣ Full Flat Painting (Interior & Exterior)
2️⃣ Single Room or Designer Accent / Texture Wall
3️⃣ Waterproofing & Wall Dampness Treatment
4️⃣ Minor Touch-up, Crack filling & Putty work

_Reply with 1, 2, 3, 4 or describe your project_`,
        scopeQuestion: `What is the property configuration? 🏢

1️⃣ 1 BHK Flat
2️⃣ 2 BHK Flat
3️⃣ 3 BHK / Independent House
4️⃣ Commercial Office / Shop

_Reply 1, 2, 3, 4_`,
        scopeOptions: {
            '1': '1 BHK Flat',
            '2': '2 BHK Flat',
            '3': '3 BHK / Independent House',
            '4': 'Commercial Office / Shop'
        },
        prefQuestion: `Do you need paint materials supplied or labor only? 🖌️

1️⃣ Full Package (Asian Paints / Royale + Primer + Labor)
2️⃣ Labor only (You will supply the paint)
3️⃣ Need free shade card & on-site inspection first

_Reply 1, 2, or 3_`,
        prefOptions: {
            '1': 'Full Package (Paint + Materials + Labor)',
            '2': 'Labor Only',
            '3': 'Free On-Site Inspection & Shade Card'
        },
        slots: {
            '1': 'Tomorrow Morning (10:00 AM – 1:00 PM)',
            '2': 'Tomorrow Afternoon (3:00 PM – 6:00 PM)',
            '3': 'This Weekend (Saturday / Sunday)'
        }
    },

    'Carpenter Services': {
        icon: '🪚',
        options: {
            '1': 'Furniture Assembly / Dismantling (Bed, Wardrobe, Desk)',
            '2': 'Door lock, Latch, or Hinge repair / replacement',
            '3': 'Custom Shelving, Cabinets, or Woodwork',
            '4': 'Modular Kitchen channel, Drawer, or Hinges fix'
        },
        stage1Text: `What carpentry work do you need? 🪚

1️⃣ Furniture Assembly / Dismantling (Bed, Wardrobe, Desk)
2️⃣ Door lock, Latch, or Hinge repair / replacement
3️⃣ Custom Shelving, Cabinets, or Woodwork
4️⃣ Modular Kitchen channel, Drawer, or Hinges fix

_Reply with 1, 2, 3, 4 or describe the work_`,
        scopeQuestion: `What specific items need attention? 🔨

1️⃣ 1 or 2 small repairs (lock, handle, hinge)
2️⃣ Bed or Wardrobe assembly / dismantling
3️⃣ Modular kitchen drawers / telescopic channels
4️⃣ Multiple custom woodwork items

_Reply 1, 2, 3, 4 or describe_`,
        scopeOptions: {
            '1': '1 or 2 small repairs (lock, hinge)',
            '2': 'Bed / Wardrobe assembly / dismantling',
            '3': 'Modular kitchen channels / drawers',
            '4': 'Multiple custom woodwork items'
        },
        prefQuestion: `Do you have the hardware/materials required? 🔩

1️⃣ Yes, I already have the replacement parts
2️⃣ Carpenter should supply standard parts with invoice
3️⃣ Carpenter should inspect first to determine parts

_Reply 1, 2, or 3_`,
        prefOptions: {
            '1': 'Customer has replacement parts',
            '2': 'Carpenter to supply parts with invoice',
            '3': 'Inspection required first'
        },
        slots: {
            '1': 'Today Evening (4:30 PM – 7:30 PM)',
            '2': 'Tomorrow Morning (10:00 AM – 1:30 PM)',
            '3': 'Tomorrow Afternoon (2:30 PM – 6:00 PM)'
        }
    },

    'Plumbing / Pipe Repair': {
        icon: '🔧',
        options: {
            '1': 'Tap, Faucet, Diverter, or Shower leakage',
            '2': 'Blocked Sink, Washbasin, or Drain pipe',
            '3': 'Toilet, Flush Tank, or Western commode repair',
            '4': 'Overhead Water Tank, Motor, or Pipeline replacement'
        },
        stage1Text: `What plumbing issue do you need help with? 🔧

1️⃣ Tap, Faucet, Diverter, or Shower leakage
2️⃣ Blocked Sink, Washbasin, or Drain pipe
3️⃣ Toilet, Flush Tank, or Western commode repair
4️⃣ Overhead Water Tank, Motor, or Pipeline replacement

_Reply with 1, 2, 3, 4 or describe the problem_`,
        scopeQuestion: `Where is the plumbing issue located? 🚿

1️⃣ Bathroom / Shower area
2️⃣ Kitchen Sink / Utility area
3️⃣ Toilet / Flush tank / Commode
4️⃣ Main inlet pipe / Overhead water tank

_Reply 1, 2, 3, 4_`,
        scopeOptions: {
            '1': 'Bathroom / Shower',
            '2': 'Kitchen Sink / Utility',
            '3': 'Toilet / Flush Commode',
            '4': 'Main Pipe / Overhead Tank'
        },
        prefQuestion: `What is the severity of the leak? 🚨

1️⃣ 🚨 Active emergency leak / water overflowing!
2️⃣ Minor drip / slow drainage (manageable)
3️⃣ Replacement or new installation

_Reply 1, 2, or 3_`,
        prefOptions: {
            '1': '🚨 Active emergency leak / overflowing',
            '2': 'Minor drip / slow drainage',
            '3': 'Replacement / New installation'
        },
        slots: {
            '1': 'Urgent / Today Evening (within 2–3 hours)',
            '2': 'Tomorrow Morning (9:30 AM – 1:00 PM)',
            '3': 'Tomorrow Afternoon (2:00 PM – 5:30 PM)'
        }
    },

    'Pest Control': {
        icon: '🐜',
        options: {
            '1': 'Cockroach & Ant — Herbal Gel + Odorless Spray',
            '2': 'Termite (Deemak) Treatment with 2-Year Warranty',
            '3': 'Bedbugs Eradication (2-Step Treatment)',
            '4': 'Mosquito, Flies & General Insect Spray'
        },
        stage1Text: `What pest issue are you facing? 🐜

1️⃣ Cockroaches & Ants (Herbal gel & odorless spray)
2️⃣ Termites / Deemak (Deep drill & inject treatment)
3️⃣ Bedbugs (2-step intensive eradication)
4️⃣ Mosquitoes, Flies & General pest spray

_Reply with 1, 2, 3, 4 or describe your need_`,
        scopeQuestion: `What is your property type & size? 🏡

1️⃣ 1 BHK / Studio flat
2️⃣ 2 BHK / 3 BHK apartment
3️⃣ Independent Villa / Row house
4️⃣ Commercial Office / Restaurant

_Reply 1, 2, 3, 4_`,
        scopeOptions: {
            '1': '1 BHK / Studio',
            '2': '2 BHK / 3 BHK',
            '3': 'Independent Villa',
            '4': 'Commercial Office / Restaurant'
        },
        prefQuestion: `Do you have pets or infants at home? 🐶👶

1️⃣ Yes, pets/infants (100% Odorless Non-Toxic Herbal Gel)
2️⃣ No, standard certified treatment is fine

_Reply 1 or 2_`,
        prefOptions: {
            '1': 'Yes — 100% Odorless Herbal Gel Required',
            '2': 'No — Standard Certified Treatment'
        },
        slots: {
            '1': 'Tomorrow Morning (9:30 AM – 1:00 PM)',
            '2': 'Tomorrow Afternoon (2:00 PM – 5:30 PM)',
            '3': 'This Weekend (Saturday / Sunday)'
        }
    },

    'RO Water Purifier': {
        icon: '💧',
        options: {
            '1': 'Complete Filter Replacement (Sediment + Carbon + RO Membrane)',
            '2': 'No Water Flow / Machine Not Turning On',
            '3': 'Water Taste / High TDS / Water Leakage',
            '4': 'New RO Installation / Relocation service'
        },
        stage1Text: `What does your water purifier need? 💧

1️⃣ Complete Filter Replacement (Sediment + Carbon + RO Membrane)
2️⃣ No Water Flow / Machine Not Turning On
3️⃣ Water Taste / High TDS / Water Leakage
4️⃣ New RO Installation / Relocation service

_Reply with 1, 2, 3, 4 or describe your issue_`,
        scopeQuestion: `Which brand of water purifier do you use? 🏷️

1️⃣ Kent RO
2️⃣ Aquaguard / Eureka Forbes
3️⃣ Pureit / Livpure
4️⃣ Blue Star / AO Smith / Other

_Reply 1, 2, 3, 4 or type brand name_`,
        scopeOptions: {
            '1': 'Kent RO',
            '2': 'Aquaguard / Eureka Forbes',
            '3': 'Pureit / Livpure',
            '4': 'Blue Star / AO Smith / Other'
        },
        prefQuestion: `Roughly how old are the current filters / machine? ⏱️

1️⃣ Less than 1 year (Standard service)
2️⃣ 1 to 2 years (Needs filter check)
3️⃣ More than 2 years / Not sure (Full overhaul recommended)

_Reply 1, 2, or 3_`,
        prefOptions: {
            '1': 'Under 1 year (Regular service)',
            '2': '1 to 2 years old',
            '3': 'Over 2 years (Full filter replacement)'
        },
        slots: {
            '1': 'Today Evening (4:00 PM – 7:00 PM)',
            '2': 'Tomorrow Morning (10:00 AM – 1:00 PM)',
            '3': 'Tomorrow Afternoon (2:00 PM – 5:00 PM)'
        }
    }
};

// ====================================================================
// Helper: Check for In-Between User FAQs (Pricing, Warranty, Duration)
// ====================================================================
function checkFaq(text) {
    const lower = text.toLowerCase().trim();
    if (/\b(price|pricing|cost|charge|charges|fee|fees|rate|rates|kitna|paisa|rupees|rs)\b/i.test(lower)) {
        return `💡 *Pricing & Inspection Policy:*
Our doorstep inspection fee is just *₹199*.
• If you proceed with the repair/service, this ₹199 inspection fee is *100% WAIVED OFF*!
• You will only pay the genuine service labor and parts rate. No hidden fees or surprises.`;
    }
    if (/\b(warranty|guarantee|waranty|gurantee)\b/i.test(lower)) {
        return `🛡️ *Service & Parts Warranty:*
• Every booking includes a *30-Day Service Guarantee*.
• Replacement spare parts carry up to *90-Day Manufacturer Warranty*.
• If any issue recurs within 30 days, our technician revisits completely FREE.`;
    }
    if (/\b(how long|time|duration|kitna time|kab tak)\b/i.test(lower)) {
        return `⏱️ *Service Duration:*
• Routine repairs/servicing typically take *45 to 90 minutes*.
• Deep cleaning or full painting schedules are given after on-site check.
• Our expert calls you 30 minutes before arrival so you can plan accordingly.`;
    }
    if (/\b(safe|safety|trusted|verified|police|background)\b/i.test(lower)) {
        return `🔒 *Verified & Background-Checked Pros:*
• 100% of our technicians are identity-verified with Police background check.
• They carry official photo ID badges and follow strict safety guidelines.`;
    }
    return null;
}

// ====================================================================
// Helper: Build appliance-specific issue prompt
// ====================================================================
function buildIssueText(applianceName) {
    const issueMap = HOME_APPLIANCES.issues[applianceName];
    if (!issueMap) return null;
    const nums = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'];
    const keys = Object.keys(issueMap);
    const lines = keys.map((k, i) => `${nums[i]} ${issueMap[k]}`).join('\n');
    return `You selected *${applianceName}* ✅

What seems to be the problem?
${lines}

_Reply with 1–${keys.length} or describe the issue_` + CANCEL_HINT;
}

// ====================================================================
// Helper: Cancel Hint & Keyword Checker
// ====================================================================
const CANCEL_HINT = '\n\n_❌ Type *cancel* anytime to cancel order_';

function isCancel(text) {
    const lower = (text || '').toLowerCase().trim();
    if (lower === '0' || lower === 'cancel' || lower === 'stop' || lower === 'exit' || lower === 'quit') return true;
    return /\b(cancel|cancel order|cancel booking|cancle|drop order|abort|stop order|cancel karo)\b/i.test(lower);
}

// ====================================================================
// Helper: Format phone for display  91XXXXXXXXXX → +91 XXXXX XXXXX
// ====================================================================
function formatPhone(phone) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) {
        const num = digits.slice(2);
        return `+91 ${num.slice(0, 5)} ${num.slice(5)}`;
    }
    return `+${digits}`;
}

// ====================================================================
// Helper: Generate Booking ID
// ====================================================================
function generateBookingId() {
    return 'BK-' + Math.floor(1000 + Math.random() * 9000);
}

// ====================================================================
// Conversation Agent
// ====================================================================
class ConversationAgent {
    constructor() {
        this.sessions = this.loadSessions();
    }

    loadSessions() {
        try {
            if (fs.existsSync(DB_FILE)) {
                return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
            }
        } catch (_) {}
        return {};
    }

    saveSessions() {
        try {
            fs.writeFileSync(DB_FILE, JSON.stringify(this.sessions, null, 2), 'utf8');
        } catch (err) {
            console.error('[Agent DB] Save error:', err.message);
        }
    }

    // Check if session has expired (older than 6 hours)
    _isExpired(session) {
        if (!session || !session.updatedAt) return true;
        return (Date.now() - new Date(session.updatedAt).getTime()) > SESSION_EXPIRY_MS;
    }

    // Final stage number for all services (confirmed at Stage 8)
    _finalStage(session) {
        return 8;
    }

    // Phones the listener should keep chatting with
    getActivePhones() {
        const phones = [];
        for (const [phone, session] of Object.entries(this.sessions)) {
            if (!session || this._isExpired(session)) continue;
            const done = session.stage >= this._finalStage(session);
            if (done && (Date.now() - new Date(session.updatedAt).getTime()) > POST_CONFIRM_WINDOW_MS) continue;
            phones.push(phone);
        }
        return phones;
    }

    // Drop a session
    endSession(phone) {
        const cleanPhone = String(phone).replace(/[^\d]/g, '');
        if (this.sessions[cleanPhone]) {
            delete this.sessions[cleanPhone];
            this.saveSessions();
        }
    }

    // Initialize or reset session when website button is clicked
    initSession(phone, service) {
        const cleanPhone = phone.replace(/[^\d]/g, '');
        const flow = SERVICES_FLOW[service] || SERVICES_FLOW['Electrical Repair'];

        this.sessions[cleanPhone] = {
            phone: cleanPhone,
            service: service,
            stage: 1,
            appliance: null,
            subService: null,
            brandOrScope: null,
            preference: null,
            customerName: null,
            address: null,
            slot: null,
            paymentMode: null,
            bookingId: generateBookingId(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        this.saveSessions();

        return `Hello! 👋 We received your *${service}* request.

${flow.stage1Text}` + CANCEL_HINT;
    }

    // Main entry — handle incoming customer reply
    processReply(phone, messageText) {
        const cleanPhone = phone.replace(/[^\d]/g, '');
        const trimmed = (messageText || '').trim();

        let session = this.sessions[cleanPhone];

        // ── Handle cancel / restart ──
        if (session && isCancel(trimmed)) {
            const bookedService = session.service;
            delete this.sessions[cleanPhone];
            this.saveSessions();
            console.log(`[Agent] Session cancelled for +${cleanPhone}`);
            return `Your *${bookedService}* order has been cancelled. ❌

If you'd like to book a new service, simply visit our website or message us anytime! We're here to help. 🤝`;
        }

        // ── No active session or expired session ──
        if (!session || this._isExpired(session)) {
            if (session) delete this.sessions[cleanPhone];
            this.saveSessions();
            return `Hello! 👋

Thanks for reaching out. To book a verified home service, please visit our website and select the service you need.

We'll start an automated interactive booking right here on WhatsApp! 📱`;
        }

        // ── In-Between FAQ detection (Pricing, Warranty, Duration) ──
        const faqAnswer = checkFaq(trimmed);
        if (faqAnswer) {
            console.log(`[Agent] FAQ triggered for +${cleanPhone}: "${trimmed}"`);
            const resumePrompt = this._getPromptForCurrentStage(session);
            return `${faqAnswer}

━━━━━━━━━━━━━━━━━━━━
👉 *To proceed with your booking:*
${resumePrompt}`;
        }

        const flow = SERVICES_FLOW[session.service] || SERVICES_FLOW['Electrical Repair'];

        console.log(`[Agent] +${cleanPhone} | ${session.service} | Stage ${session.stage} | "${trimmed}"`);

        // ── Route to appropriate flow handler ──
        if (session.service === 'Home Appliances') {
            return this._handleHomeAppliances(session, trimmed);
        }
        return this._handleStandardService(session, flow, trimmed);
    }

    // ================================================================
    // Helper: Resume prompt for current stage
    // ================================================================
    _getPromptForCurrentStage(session) {
        let prompt = '';
        if (session.service === 'Home Appliances') {
            if (session.stage === 1) prompt = HOME_APPLIANCES.stage1Text;
            else if (session.stage === 2) prompt = buildIssueText(session.appliance);
            else if (session.stage === 3) prompt = `How urgent is this repair?\n1️⃣ 🚨 Priority (Within 2–3 hours)\n2️⃣ ⚡ Standard (Today or Tomorrow)\n3️⃣ 📅 Routine Maintenance (Flexible)\n_Reply 1, 2, or 3_`;
            else if (session.stage === 4) prompt = `May I know your *full name* for the booking?\n_Please type your name:_`;
            else if (session.stage === 5) prompt = `Please share your *complete address* with landmark: 📍\n_Flat/House No, Building/Society, Area, Landmark_`;
            else if (session.stage === 6) prompt = `When should the technician visit? ⏰\n1️⃣ Today Evening (4:00 PM – 7:30 PM)\n2️⃣ Tomorrow Morning (10:00 AM – 1:30 PM)\n3️⃣ Tomorrow Afternoon (2:30 PM – 6:00 PM)\n_Reply 1, 2, 3_`;
            else if (session.stage === 7) prompt = `How would you like to pay after service? 💳\n1️⃣ UPI (GPay / PhonePe / Paytm)\n2️⃣ Cash on completion\n3️⃣ Card / NetBanking\n_Reply 1, 2, or 3_`;
        } else {
            const flow = SERVICES_FLOW[session.service] || SERVICES_FLOW['Electrical Repair'];
            if (session.stage === 1) prompt = flow.stage1Text;
            else if (session.stage === 2) prompt = flow.scopeQuestion;
            else if (session.stage === 3) prompt = flow.prefQuestion;
            else if (session.stage === 4) prompt = `May I know your *full name* for the booking?\n_Please type your name:_`;
            else if (session.stage === 5) prompt = `Please share your *complete address* with landmark: 📍\n_Flat/House No, Building/Society, Area, Landmark_`;
            else if (session.stage === 6) prompt = `When should our specialist visit? ⏰\n1️⃣ ${flow.slots['1']}\n2️⃣ ${flow.slots['2']}\n3️⃣ ${flow.slots['3']}\n_Reply 1, 2, 3_`;
            else if (session.stage === 7) prompt = `How would you like to pay after service? 💳\n1️⃣ UPI (GPay / PhonePe / Paytm)\n2️⃣ Cash on completion\n3️⃣ Card / NetBanking\n_Reply 1, 2, or 3_`;
        }
        if (!prompt) return `How can we assist you today? 👋`;
        if (prompt.includes('Type *cancel*')) return prompt;
        return prompt + CANCEL_HINT;
    }

    // ================================================================
    // HOME APPLIANCES — Full 8-Stage Flow
    // ================================================================
    _handleHomeAppliances(session, trimmed) {
        const ha = HOME_APPLIANCES;

        // STAGE 1 → Pick appliance
        if (session.stage === 1) {
            let chosen = ha.appliances[trimmed];
            if (!chosen) {
                const lower = trimmed.toLowerCase();
                for (const [kw, app] of Object.entries(ha.applianceKeywords)) {
                    if (lower.includes(kw)) { chosen = app; break; }
                }
            }

            if (!chosen) {
                return `Sorry, I didn't catch that. 🤔\n\nPlease select your appliance:\n1️⃣ Split / Window AC\n2️⃣ Refrigerator / Fridge\n3️⃣ Washing Machine\n4️⃣ Microwave Oven\n5️⃣ Geyser / Water Heater\n6️⃣ Dishwasher\n\n_Reply with a number (1–6)_` + CANCEL_HINT;
            }

            session.appliance = chosen;
            session.stage = 2;
            session.updatedAt = new Date().toISOString();
            this.saveSessions();

            return buildIssueText(chosen) || `You selected *${chosen}* ✅\n\nPlease describe the issue so we assign the right specialist. 🔍` + CANCEL_HINT;
        }

        // STAGE 2 → Pick specific issue
        if (session.stage === 2) {
            const issueMap = ha.issues[session.appliance];
            let chosenIssue = issueMap ? issueMap[trimmed] : null;
            if (!chosenIssue) chosenIssue = trimmed;

            session.subService = chosenIssue;
            session.stage = 3;
            session.updatedAt = new Date().toISOString();
            this.saveSessions();

            return `Noted ✅ *${session.appliance}* → _${chosenIssue}_

How urgent is this repair for you? ⏱️

1️⃣ 🚨 Priority / Urgent (Within 2–3 hours)
2️⃣ ⚡ Standard (Scheduled for today or tomorrow)
3️⃣ 📅 Routine Maintenance (Flexible dates)

_Reply 1, 2, or 3_` + CANCEL_HINT;
        }

        // STAGE 3 → Urgency / Severity
        if (session.stage === 3) {
            let chosenUrgency = URGENCY_MODES[trimmed] || trimmed;
            session.preference = chosenUrgency;
            session.stage = 4;
            session.updatedAt = new Date().toISOString();
            this.saveSessions();

            return `Got it ✅ Priority: _${chosenUrgency}_

May I know your *full name* so our specialist knows who to address? 👤

_Please type your name:_` + CANCEL_HINT;
        }

        // STAGE 4 → Customer Name
        if (session.stage === 4) {
            if (trimmed.length < 2) {
                return `Please type your full name so we can create your service ticket: 👤` + CANCEL_HINT;
            }

            session.customerName = trimmed;
            session.stage = 5;
            session.updatedAt = new Date().toISOString();
            this.saveSessions();

            return `Pleasure to assist you, *${trimmed}*! 👋

Please share your *complete service address* with a nearby landmark: 📍
_Flat/House No, Building/Society, Area, Landmark_

_This helps our technician locate you quickly._` + CANCEL_HINT;
        }

        // STAGE 5 → Address & Landmark
        if (session.stage === 5) {
            if (trimmed.length < 8) {
                return `That seems a bit too brief. 🤔

Please provide your full address including:
• Flat / House number & Building name
• Area & Nearby Landmark

_This ensures our technician reaches you without delay!_` + CANCEL_HINT;
            }

            session.address = trimmed;
            session.stage = 6;
            session.updatedAt = new Date().toISOString();
            this.saveSessions();

            return `📍 Address saved!

When should our verified specialist visit? ⏰

1️⃣ ${ha.slots['1']}
2️⃣ ${ha.slots['2']}
3️⃣ ${ha.slots['3']}

_Reply 1, 2, 3 or type your preferred date & time_` + CANCEL_HINT;
        }

        // STAGE 6 → Visit Slot
        if (session.stage === 6) {
            let chosenSlot = ha.slots[trimmed] || trimmed;
            session.slot = chosenSlot;
            session.stage = 7;
            session.updatedAt = new Date().toISOString();
            this.saveSessions();

            return `⏰ Visit scheduled for *${chosenSlot}*!

How would you prefer to settle payment *after* the service is completed? 💳

1️⃣ UPI (Google Pay, PhonePe, Paytm, QR)
2️⃣ Cash on completion
3️⃣ Credit / Debit Card

_Reply 1, 2, or 3_` + CANCEL_HINT;
        }

        // STAGE 7 → Payment Mode → Final Confirmation
        if (session.stage === 7) {
            let chosenPayment = PAYMENT_MODES[trimmed] || PAYMENT_KEYWORDS[trimmed.toLowerCase()] || trimmed;
            session.paymentMode = chosenPayment;
            session.stage = 8;
            session.updatedAt = new Date().toISOString();
            this.saveSessions();

            const expert = EXPERTS[session.service] || EXPERTS['Home Appliances'];

            return `🎉 *BOOKING CONFIRMED!*

━━━━━━━━━━━━━━━━━━━━━━
🎫 *Booking ID:* #${session.bookingId}
━━━━━━━━━━━━━━━━━━━━━━
👤 *Customer:* ${session.customerName || 'Valued Customer'}
🏠 *Appliance:* ${session.appliance}
🔧 *Issue:* ${session.subService}
🚨 *Priority:* ${session.preference}
📍 *Address:* ${session.address}
⏰ *Scheduled Slot:* ${session.slot}
💳 *Payment Mode:* ${session.paymentMode}
📞 *Contact:* ${formatPhone(session.phone)}
━━━━━━━━━━━━━━━━━━━━━━
👨‍🔧 *Assigned Expert:* ${expert}
💰 *Doorstep Inspection:* ₹199 (100% WAIVED OFF if service taken)
🛡️ *Guarantee:* 30-Day Service Guarantee + 90-Day Parts Warranty

Our specialist will call you *30 minutes before arrival*.
Need to reschedule or add instructions? Simply reply here anytime. Type *cancel* to cancel. ⭐`;
        }

        // STAGE 8 → Already Confirmed
        if (session.stage === 8) {
            return `Your *${session.appliance}* booking is confirmed! ✅

🎫 *Booking ID:* #${session.bookingId}
⏰ *Scheduled Slot:* ${session.slot}
📍 *Address:* ${session.address}
👨‍🔧 *Technician:* ${EXPERTS[session.service]}

Our technician will call you 30 minutes before arriving. To reschedule or ask a question, reply here! 🤝`;
        }

        return `Hello! How can we help you today? 👋`;
    }

    // ================================================================
    // STANDARD SERVICES — Full 8-Stage Flow
    // ================================================================
    _handleStandardService(session, flow, trimmed) {

        // STAGE 1 → Sub-service selection
        if (session.stage === 1) {
            let chosen = flow.options[trimmed];
            if (!chosen && trimmed.length >= 3) {
                const lower = trimmed.toLowerCase();
                for (const opt of Object.values(flow.options)) {
                    if (opt.toLowerCase().includes(lower)) { chosen = opt; break; }
                }
            }
            if (!chosen) chosen = trimmed;

            session.subService = chosen;
            session.stage = 2;
            session.updatedAt = new Date().toISOString();
            this.saveSessions();

            return `Noted ✅ *${chosen}*

${flow.scopeQuestion}` + CANCEL_HINT;
        }

        // STAGE 2 → Scope / Work details
        if (session.stage === 2) {
            let chosenScope = (flow.scopeOptions && flow.scopeOptions[trimmed]) ? flow.scopeOptions[trimmed] : trimmed;
            session.brandOrScope = chosenScope;
            session.stage = 3;
            session.updatedAt = new Date().toISOString();
            this.saveSessions();

            return `Details noted: *${chosenScope}* ✅

${flow.prefQuestion}` + CANCEL_HINT;
        }

        // STAGE 3 → Specific preference / Urgency
        if (session.stage === 3) {
            let chosenPref = (flow.prefOptions && flow.prefOptions[trimmed]) ? flow.prefOptions[trimmed] : trimmed;
            session.preference = chosenPref;
            session.stage = 4;
            session.updatedAt = new Date().toISOString();
            this.saveSessions();

            return `Preference saved: *${chosenPref}* 📋

May I know your *full name* for the service ticket? 👤

_Please type your name:_` + CANCEL_HINT;
        }

        // STAGE 4 → Customer Name
        if (session.stage === 4) {
            if (trimmed.length < 2) {
                return `Please type your full name so we can create your service ticket: 👤` + CANCEL_HINT;
            }

            session.customerName = trimmed;
            session.stage = 5;
            session.updatedAt = new Date().toISOString();
            this.saveSessions();

            return `Pleasure to assist you, *${trimmed}*! 👋

Please share your *complete service address* with a nearby landmark: 📍
_Flat/House No, Building/Society, Area, Landmark_

_This helps our specialist locate you without delays._` + CANCEL_HINT;
        }

        // STAGE 5 → Complete Address & Landmark
        if (session.stage === 5) {
            if (trimmed.length < 8) {
                return `That seems a bit too brief. 🤔

Please provide your complete address including:
• Flat / House number & Building name
• Area & Nearby Landmark

_This helps our professional find you easily._` + CANCEL_HINT;
            }

            session.address = trimmed;
            session.stage = 6;
            session.updatedAt = new Date().toISOString();
            this.saveSessions();

            return `📍 Address saved!

When should our verified specialist visit? ⏰

1️⃣ ${flow.slots['1']}
2️⃣ ${flow.slots['2']}
3️⃣ ${flow.slots['3']}

_Reply 1, 2, 3 or type your preferred date & time_` + CANCEL_HINT;
        }

        // STAGE 6 → Visit Slot
        if (session.stage === 6) {
            let chosenSlot = flow.slots[trimmed] || trimmed;
            session.slot = chosenSlot;
            session.stage = 7;
            session.updatedAt = new Date().toISOString();
            this.saveSessions();

            return `⏰ Visit scheduled for *${chosenSlot}*!

How would you prefer to settle payment *after* the service is completed? 💳

1️⃣ UPI (Google Pay, PhonePe, Paytm, QR)
2️⃣ Cash on completion
3️⃣ Credit / Debit Card

_Reply 1, 2, or 3_` + CANCEL_HINT;
        }

        // STAGE 7 → Payment Mode → Final Confirmation
        if (session.stage === 7) {
            let chosenPayment = PAYMENT_MODES[trimmed] || PAYMENT_KEYWORDS[trimmed.toLowerCase()] || trimmed;
            session.paymentMode = chosenPayment;
            session.stage = 8;
            session.updatedAt = new Date().toISOString();
            this.saveSessions();

            const expert = EXPERTS[session.service] || 'Senior Verified Professional (4.9⭐)';

            return `🎉 *BOOKING CONFIRMED!*

━━━━━━━━━━━━━━━━━━━━━━
🎫 *Booking ID:* #${session.bookingId}
━━━━━━━━━━━━━━━━━━━━━━
👤 *Customer:* ${session.customerName || 'Valued Customer'}
🛠️ *Service:* ${session.service}
🔧 *Type:* ${session.subService}
📋 *Scope:* ${session.brandOrScope}
⚙️ *Details:* ${session.preference}
📍 *Address:* ${session.address}
⏰ *Scheduled Slot:* ${session.slot}
💳 *Payment Mode:* ${session.paymentMode}
📞 *Contact:* ${formatPhone(session.phone)}
━━━━━━━━━━━━━━━━━━━━━━
👨‍🔧 *Assigned Expert:* ${expert}
💰 *Doorstep Inspection:* ₹199 (100% WAIVED OFF if service taken)
🛡️ *Guarantee:* 30-Day Service Guarantee + 90-Day Parts Warranty

Our specialist will call you *30 minutes before arrival*.
Need to reschedule or add instructions? Simply reply here anytime. Type *cancel* to cancel. ⭐`;
        }

        // STAGE 8 → Already Confirmed
        if (session.stage === 8) {
            return `Your *${session.service}* booking is confirmed! ✅

🎫 *Booking ID:* #${session.bookingId}
⏰ *Scheduled Slot:* ${session.slot}
📍 *Address:* ${session.address}
👨‍🔧 *Assigned Pro:* ${EXPERTS[session.service] || 'Verified Specialist'}

Our professional will call you 30 minutes before arriving. Need changes? Just type *cancel* to start fresh. 🤝`;
        }

        return `Hello! How can we help you today? 👋`;
    }
}

module.exports = new ConversationAgent();
