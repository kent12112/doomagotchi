// Runs on every website. Shows the pet in the corner of the page, reacts live to what
// you're doing, and shows a full-screen death scene on the doom site that killed it.
//
// The pet is in one of 4 modes:
//   doom  - you're on a doom site: scared face, tears, shaking, flinches on every scroll
//   happy - you're on a safe site: hops, says nice things, sparkles when it heals
//   sleep - safe site but no input for a minute: eyes closed, floating Zzz
//   dead  - tombstone

const LINES = {
  doom: ["please stop", "my eyes...", "touch grass?", "I'm literally dying", "one more reel = one less me", "why do you hate me"],
  happy: ["thanks for working!", "we're so productive", "I love you", "this is nice :)", "proud of you"],
};
const BUBBLE_EVERY_MS = { doom: 6000, happy: 30000 }; // happy talk less, so it's not annoying all day
const FRAME_MS = 150;       // animation speed (tears, effects)
const FRAMES_PER_STEP = 3;  // the pet itself moves every 3 frames (~450ms)
const IDLE_MS = (DEMO ? 5 : 60) * 1000; // no input for this long on a safe page = pet falls asleep
const FLINCH_COOLDOWN_MS = 300;

let pet = null;
let mode = null;
let frame = 0;
let lastInput = Date.now();
let lastFlinch = 0;
let lastBubble = 0;
let lastZzz = 0;
let lastDoomPing = 0;
let bubbleTimer = null;

// Shadow DOM: our HTML/CSS lives in its own bubble, so the site's styles can't break it
const host = document.createElement("div");
const root = host.attachShadow({ mode: "open" });
root.innerHTML = `
  <style>
    :host { all: initial; }
    .mini {
      --shake: 0px;
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
      width: 104px; padding: 14px 0 12px;
      border-radius: 50% 50% 46% 46% / 60% 60% 40% 40%;
      background: linear-gradient(160deg, #ffb3d1, #ff7eb3);
      box-shadow: inset -5px -6px 0 rgba(0,0,0,.12), 0 4px 12px rgba(0,0,0,.3);
      display: flex; flex-direction: column; align-items: center;
      font-family: monospace;
    }
    .mini.doom { animation: shake .25s infinite; }
    .mini.jump { animation: jump .45s 2; }
    .screen {
      background: #9bbc0f; color: #0f380f; border: 4px solid #3a3a3a; border-radius: 8px;
      padding: 3px; text-align: center;
    }
    .screen.hit { animation: hit .3s; }
    canvas { display: block; image-rendering: pixelated; }
    .hearts { font-size: 11px; letter-spacing: 1px; }
    .name { margin-top: 4px; font-size: 11px; font-weight: bold; color: #5a2a4a; }

    .bubble {
      position: absolute; bottom: calc(100% + 10px); right: 0;
      width: max-content; max-width: 170px; padding: 6px 10px;
      background: #fff; color: #222; border-radius: 10px;
      font: bold 12px monospace; box-shadow: 0 3px 10px rgba(0,0,0,.25);
      animation: pop .25s;
    }
    .bubble::after { /* the little tail pointing at the pet */
      content: ""; position: absolute; top: 100%; right: 40px;
      border: 7px solid transparent; border-top-color: #fff;
    }
    .bubble[hidden] { display: none; }

    .fx { position: absolute; inset: 0; pointer-events: none; }
    .float {
      position: absolute; left: 50%; top: 10px; white-space: nowrap;
      font: bold 14px monospace; text-shadow: 0 0 3px #fff, 0 0 3px #fff;
      animation: float-up 1.2s ease-out forwards;
    }
    .float.bad { color: #d33; }
    .float.big { font-size: 20px; }
    .float.good { color: #2a9d4b; }
    .float.zzz { color: #5a2a4a; }
    .confetti { position: absolute; left: 50%; top: 40%; width: 6px; height: 6px; animation: burst .9s ease-out forwards; }

    .death {
      position: fixed; inset: 0; z-index: 2147483647;
      background: rgba(0,0,0,.88); color: #fff;
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
      font-family: monospace; text-align: center;
      animation: fade 1.5s ease-out;
    }
    .death[hidden] { display: none; }
    .death canvas { animation: drop 1.2s cubic-bezier(.3,1.6,.5,1); }
    .death h1 { margin: 0; font-size: 36px; }
    .death p { margin: 0; font-size: 18px; color: #ffb3d1; }
    .death button {
      font: bold 16px monospace; padding: 10px 18px; margin: 4px;
      border: none; border-radius: 8px; cursor: pointer;
      background: #ffe066; box-shadow: 0 3px 0 #c9a800;
    }
    .death button.close { background: #555; color: #fff; box-shadow: 0 3px 0 #333; }

    @keyframes shake { 0%,100% { transform: translateX(0) } 25% { transform: translateX(calc(-1 * var(--shake))) } 75% { transform: translateX(var(--shake)) } }
    @keyframes jump { 50% { transform: translateY(-24px) } }
    @keyframes hit { 30% { transform: translateY(-8px) scale(1.06); background: #e05050 } }
    @keyframes pop { from { transform: scale(.5); opacity: 0 } }
    @keyframes float-up { from { transform: translateX(-50%) } to { transform: translate(calc(-50% + var(--dx, 0px)), -60px); opacity: 0 } }
    @keyframes burst { to { transform: translate(var(--dx), var(--dy)) rotate(360deg); opacity: 0 } }
    @keyframes fade { from { opacity: 0 } }
    @keyframes drop { from { transform: translateY(-100vh) } }
  </style>

  <div class="mini">
    <div class="bubble" hidden></div>
    <div class="screen">
      <canvas width="80" height="64"></canvas>
      <div class="hearts"></div>
    </div>
    <div class="name"></div>
    <div class="fx"></div>
  </div>

  <div class="death" hidden>
    <canvas width="192" height="192"></canvas>
    <h1></h1>
    <p></p>
    <div>
      <button class="certificate">📜 Death certificate</button>
      <button class="close">Close</button>
    </div>
  </div>
`;
document.documentElement.appendChild(host);

const mini = root.querySelector(".mini");
const screen = mini.querySelector(".screen");
const miniCanvas = mini.querySelector("canvas");
const bubble = mini.querySelector(".bubble");
const fx = mini.querySelector(".fx");
const death = root.querySelector(".death");

// YouTube is only a doom site on /shorts, and it changes pages without reloading,
// so we re-check the URL every frame instead of once at load.
function isDoomPage() {
  return doomSiteFor(new URL(location.href)) !== null;
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// ---------- Effects ----------

// A one-shot CSS animation only plays when its class is added, so remove it,
// force the browser to notice (reading offsetWidth), then add it back.
function replay(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

// Text that floats up from the pet and fades out, like "-1 💔"
function floatText(text, cls) {
  const el = document.createElement("span");
  el.className = `float ${cls}`;
  el.textContent = text;
  el.style.setProperty("--dx", `${Math.random() * 30 - 15}px`);
  el.addEventListener("animationend", () => el.remove());
  fx.appendChild(el);
}

function say(text) {
  bubble.hidden = true;
  void bubble.offsetWidth; // hiding then showing again restarts the pop animation
  bubble.textContent = text;
  bubble.hidden = false;
  lastBubble = Date.now();
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => (bubble.hidden = true), 3000);
}

function celebrate() {
  replay(mini, "jump");
  say("YOU ESCAPED! 🎉");
  for (let i = 0; i < 16; i++) {
    const c = document.createElement("span");
    c.className = "confetti";
    c.style.background = pick(["#ff7eb3", "#ffe066", "#9bbc0f", "#4aa8ff", "#fff"]);
    const angle = Math.random() * 2 * Math.PI;
    const dist = 40 + Math.random() * 50;
    c.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    c.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
    c.addEventListener("animationend", () => c.remove());
    fx.appendChild(c);
  }
  chrome.storage.local.set({ doomSeenAt: 0 }); // so no other tab celebrates the same escape
}

// Blue tear pixels that slide down from the eyes to the chin
function drawTears({ x, y, cell }) {
  if (stageFor(pet) === "egg") return; // eggs don't have eyes
  const ctx = miniCanvas.getContext("2d");
  const row = 7 + (frame % 5);
  ctx.fillStyle = "#4aa8ff";
  [5, 10].forEach((col) => ctx.fillRect(x + col * cell, y + row * cell, cell, cell));
}

// ---------- Modes ----------

function currentMode() {
  if (pet.hp <= 0) return "dead";
  if (isDoomPage()) return "doom";
  if (Date.now() - lastInput > IDLE_MS) return "sleep";
  return "happy";
}

function setMode(next) {
  if (next === mode) return;
  const prev = mode;
  mode = next;
  mini.classList.toggle("doom", mode === "doom");
  if (mode !== "doom") screen.style.filter = "";
  if (mode === "dead") bubble.hidden = true;
  if (prev === "doom" && mode === "happy") celebrate();
  else if (mode === "doom") say(pick(LINES.doom));
}

// Tell other tabs we're doom scrolling, so the safe tab you switch to can celebrate
function pingDoom() {
  if (Date.now() - lastDoomPing < 2000) return;
  lastDoomPing = Date.now();
  chrome.storage.local.set({ doomSeenAt: lastDoomPing });
}

// Did you just come here from a doom site (closed it, switched tabs)?
async function checkEscape() {
  if (!pet || pet.hp <= 0 || isDoomPage() || document.hidden) return;
  const { doomSeenAt = 0 } = await chrome.storage.local.get("doomSeenAt");
  if (Date.now() - doomSeenAt < 5000) celebrate();
}

// Runs every 150ms
function onFrame() {
  if (!pet || document.hidden) return; // no point animating a tab nobody sees
  frame++;
  setMode(currentMode());

  const step = Math.floor(frame / FRAMES_PER_STEP);
  const face = mode === "doom" ? "scared" : mode === "sleep" ? "sleep" : undefined;
  const spot = drawPet(miniCanvas, pet, step, { face, hop: mode === "happy" });

  const now = Date.now();
  if (mode === "doom") {
    drawTears(spot);
    mini.style.setProperty("--shake", `${1 + (100 - pet.hp) / 20}px`);     // 1px at full HP, 6px near death
    screen.style.filter = `brightness(${0.55 + (0.45 * pet.hp) / 100})`; // LCD dims as it dies
    pingDoom();
  }
  if (BUBBLE_EVERY_MS[mode] && now - lastBubble > BUBBLE_EVERY_MS[mode]) say(pick(LINES[mode]));
  if (mode === "sleep" && now - lastZzz > 1500) {
    floatText("z Z z", "zzz");
    lastZzz = now;
  }
}

// ---------- Input ----------

function onScroll() {
  lastInput = Date.now();
  if (mode !== "doom" || Date.now() - lastFlinch < FLINCH_COOLDOWN_MS) return;
  lastFlinch = Date.now();
  replay(screen, "hit");
  floatText("-1 💔", "bad");
}

// capture: true catches scrolling inside inner boxes too (Instagram's feed isn't the page itself)
document.addEventListener("scroll", onScroll, { capture: true, passive: true });
document.addEventListener("wheel", onScroll, { passive: true });
document.addEventListener("touchmove", onScroll, { passive: true });
for (const type of ["mousemove", "keydown", "pointerdown"]) {
  document.addEventListener(type, () => (lastInput = Date.now()), { passive: true });
}
document.addEventListener("visibilitychange", checkEscape);
window.addEventListener("focus", checkEscape);

// Take the jump class off when it finishes, or it would block the doom shake later
mini.addEventListener("animationend", (e) => {
  if (e.animationName === "jump") mini.classList.remove("jump");
});

// ---------- Death scene ----------

function showDeath(grave) {
  death.querySelector("h1").textContent = `💀 ${grave.name} has died.`;
  death.querySelector("p").textContent = `Cause of death: ${formatScroll(grave.scroll[grave.killer])} of ${grave.killer}`;
  const canvas = death.querySelector("canvas");
  drawRows(canvas.getContext("2d"), TOMBSTONE, 0, 0, canvas.width / 16, "#ddd");
  death.hidden = false;
  if (document.visibilityState === "visible") playDeathSound(); // not from background tabs
}

// A sad descending "game over" jingle, made with the Web Audio API (no sound files)
function playDeathSound() {
  try {
    const audio = new AudioContext();
    [523, 440, 349, 262].forEach((freq, i) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      gain.gain.value = 0.08;
      osc.connect(gain).connect(audio.destination);
      const start = audio.currentTime + i * 0.35;
      osc.start(start);
      osc.stop(start + (i === 3 ? 0.8 : 0.3)); // hold the last note
    });
  } catch {
    // browsers block audio until you've clicked the page; the death scene still shows
  }
}

death.querySelector(".certificate").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "open", page: "certificate.html" });
});
death.querySelector(".close").addEventListener("click", () => (death.hidden = true));

// ---------- State ----------

function renderStats() {
  mini.querySelector(".hearts").textContent = heartsFor(pet.hp);
  mini.querySelector(".name").textContent = pet.hp > 0 ? pet.name : `RIP ${pet.name}`;
}

chrome.storage.onChanged.addListener((changes) => {
  if (!changes.pet) return;
  const before = changes.pet.oldValue;
  pet = changes.pet.newValue;
  renderStats();

  const wasAlive = before?.hp > 0;
  const grave = changes.graveyard?.newValue?.at(-1);
  if (wasAlive && pet.hp === 0 && grave && isDoomPage()) showDeath(grave);

  // HP changed on a background tick: show it
  const diff = pet.hp - (before?.hp ?? pet.hp);
  if (!wasAlive || document.hidden) return;
  if (diff > 0) {
    floatText(`+${diff} ❤️`, "good");
    floatText("✨", "good");
  } else if (diff < 0) {
    floatText(`${diff} 💔`, "bad big");
  }
});

chrome.storage.local.get("pet").then((data) => {
  pet = data.pet ?? null;
  if (pet) {
    renderStats();
    checkEscape();
  }
  setInterval(onFrame, FRAME_MS); // onFrame waits until there's a pet
});
