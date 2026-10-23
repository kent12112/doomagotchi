importScripts("pet.js"); // DEMO, DOOM_SITES, newPet, doomSiteFor, MAX_HP...

const DAMAGE = DEMO ? 10 : 5;          // HP lost per tick while doom scrolling
const HEAL = DEMO ? 5 : 1;             // HP gained per tick otherwise
const TICK_SECONDS = DEMO ? 2 : 30;    // 30s is Chrome's minimum for published extensions; unpacked ones can go faster
const IDLE_SECONDS = DEMO ? 15 : 120;  // no mouse/keyboard for this long = you walked away (15 is Chrome's minimum)

const WARNINGS = [
  { below: 50, title: "is getting hungry", message: "Maybe close the tab?" },
  { below: 20, title: "is freezing...", message: "It's getting cold in here. Please stop scrolling." },
];

chrome.runtime.onInstalled.addListener(async () => {
  const { pet } = await chrome.storage.local.get("pet");
  if (!pet) await chrome.storage.local.set({ pet: newPet() });
  await chrome.storage.local.remove("hp"); // leftover from v0.1
  chrome.alarms.create("tick", { periodInMinutes: TICK_SECONDS / 60 });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "tick") await tick();
});

async function tick() {
  const { pet, graveyard = [] } = await chrome.storage.local.get(["pet", "graveyard"]);
  if (!pet || pet.hp <= 0) return; // dead, wait for a new egg

  const before = pet.hp;
  const site = await currentDoomSite();
  if (site) {
    pet.hp -= DAMAGE;
    pet.scroll[site] = (pet.scroll[site] ?? 0) + TICK_SECONDS;
  } else {
    pet.hp += HEAL;
  }
  pet.hp = Math.max(0, Math.min(MAX_HP, pet.hp));

  if (pet.hp === 0) graveyard.push(bury(pet));
  // Save pet + graveyard together so the death screen sees both at once
  await chrome.storage.local.set({ pet, graveyard });
  guiltTrip(pet, before);
}

// Which doom site are you actively looking at right now? null if none.
async function currentDoomSite() {
  try {
    const win = await chrome.windows.getLastFocused({ populate: true });
    if (!win.focused) return null; // Chrome is in the background
    if ((await chrome.idle.queryState(IDLE_SECONDS)) !== "active") return null;
    const tab = win.tabs.find((t) => t.active);
    return tab?.url ? doomSiteFor(new URL(tab.url)) : null;
  } catch {
    return null; // no Chrome windows open
  }
}

// Turn a dead pet into a graveyard entry. The killer is the site it lost the most time to.
function bury(pet) {
  const [killer] = Object.entries(pet.scroll).sort((a, b) => b[1] - a[1])[0];
  notify(`${pet.name} has died 💀`, `Cause of death: ${formatScroll(pet.scroll[killer])} of ${killer}.`);
  return { name: pet.name, bornAt: pet.bornAt, diedAt: Date.now(), scroll: pet.scroll, killer };
}

// Send a notification the first time HP drops below each warning level
function guiltTrip(pet, before) {
  for (const w of WARNINGS) {
    if (before >= w.below && pet.hp < w.below && pet.hp > 0) {
      notify(`${pet.name} ${w.title}`, w.message);
    }
  }
}

function notify(title, message) {
  chrome.notifications.create({ type: "basic", iconUrl: "icons/icon128.png", title, message });
}

// Show HP on the extension icon whenever the pet changes (ticks, hatching)
chrome.storage.onChanged.addListener((changes) => {
  const pet = changes.pet?.newValue;
  if (!pet) return;
  chrome.action.setBadgeText({ text: pet.hp > 0 ? String(pet.hp) : "RIP" });
  chrome.action.setBadgeBackgroundColor({ color: pet.hp > 50 ? "#2a9d4b" : pet.hp > 20 ? "#e9a23b" : "#d33" });
});

// content.js can't open extension pages itself, so it asks us
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "open") chrome.tabs.create({ url: chrome.runtime.getURL(msg.page) });
});
