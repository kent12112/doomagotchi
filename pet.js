// Shared code, loaded by background.js (importScripts), the popup, the pages and content.js.
// Nothing here touches the DOM at load time, so the background service worker can use it too.

// 🎬 Demo mode for filming: dies in ~20s of scrolling, hatches in 10s, sleeps after 5s.
// Set back to false when you're done, then reload the extension.
const DEMO = false;

// ---------- Sites ----------

const DOOM_SITES = ["tiktok.com", "instagram.com", "x.com", "twitter.com", "reddit.com", "youtube.com/shorts"];

// "reddit.com" matches reddit.com and old.reddit.com, but not notreddit.com.
// "youtube.com/shorts" also requires the path to start with /shorts.
function matchesSite(url, site) {
  const [domain, ...pathParts] = site.split("/");
  const path = "/" + pathParts.join("/");
  const hostMatches = url.hostname === domain || url.hostname.endsWith("." + domain);
  return hostMatches && url.pathname.startsWith(path);
}

// Which doom site is this URL? null if it's safe.
function doomSiteFor(url) {
  return DOOM_SITES.find((site) => matchesSite(url, site)) ?? null;
}

// ---------- Pet state ----------

const MAX_HP = 100;
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const NAMES = ["Mochi", "Pixel", "Bean", "Tofu", "Nugget", "Boba", "Dumpling", "Pebble"];

// A pet looks like: { name, hp, bornAt, scroll: { "reddit.com": secondsSpentThere } }
function newPet(name) {
  return {
    name: name || NAMES[Math.floor(Math.random() * NAMES.length)],
    hp: MAX_HP,
    bornAt: Date.now(),
    scroll: {},
  };
}

// It grows up the longer it survives
const STAGES = DEMO
  ? [
      { name: "egg", until: 10 * SECOND },
      { name: "baby", until: 1 * MINUTE },
      { name: "adult", until: 2 * MINUTE },
      { name: "elder", until: Infinity },
    ]
  : [
      { name: "egg", until: 5 * MINUTE },
      { name: "baby", until: DAY },
      { name: "adult", until: 3 * DAY },
      { name: "elder", until: Infinity },
    ];

function stageFor(pet) {
  const age = Date.now() - pet.bornAt;
  return STAGES.find((s) => age < s.until).name;
}

// Checked top to bottom: first mood whose minHp you meet wins (none when dead)
const MOODS = [
  { minHp: 80, text: "Thriving!", eyes: "open", mouth: "smile" },
  { minHp: 50, text: "Doing okay", eyes: "open", mouth: "flat" },
  { minHp: 20, text: "Not feeling great", eyes: "sad", mouth: "frown" },
  { minHp: 1, text: "Dying... close the app!", eyes: "dizzy", mouth: "wavy", stink: true },
];

function moodFor(hp) {
  return MOODS.find((m) => hp >= m.minHp);
}

function heartsFor(hp) {
  const full = Math.ceil(hp / 20);
  return "♥".repeat(full) + "♡".repeat(5 - full);
}

// 90061000 -> "1d 1h", 4500000 -> "1h 15m", 300000 -> "5m", 20000 -> "20s"
function formatDuration(ms) {
  const minutes = Math.floor(ms / MINUTE);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days) return `${days}d ${hours % 24}h`;
  if (hours) return `${hours}h ${minutes % 60}m`;
  if (minutes) return `${minutes}m`;
  return `${Math.floor(ms / SECOND)}s`;
}

// Time spent on a doom site: 20 -> "20 sec", 360 -> "6 min"
function formatScroll(seconds) {
  return seconds < 60 ? `${seconds} sec` : `${Math.round(seconds / 60)} min`;
}

// ---------- Sprites (16x16, "#" = pixel, "." = empty) ----------

// The blob's body. Rows 5-6 (eyes) and 8-9 (mouth) get swapped per mood.
const BODY = [
  "................",
  ".....######.....",
  "...##......##...",
  "..#..........#..",
  ".#............#.",
  ".#............#.", // eyes
  ".#............#.", // eyes
  ".#............#.",
  ".#............#.", // mouth
  ".#............#.", // mouth
  ".#............#.",
  "..#..........#..",
  "...##......##...",
  ".....######.....",
  "....##....##....",
  "................",
];

const EYES = {
  open:   [".#..##....##..#.", ".#..##....##..#."],
  closed: [".#............#.", ".#..##....##..#."],
  sad:    [".#...#....#...#.", ".#..##....##..#."],
  dizzy:  [".#..#.#..#.#..#.", ".#...#....#...#."],
  scared: [".#..#......#..#.", ".#...#....#...#."], // squeezed shut, like >_<
};

const MOUTHS = {
  smile: [".#..#......#..#.", ".#...######...#."],
  flat:  [".#............#.", ".#....####....#."],
  frown: [".#....####....#.", ".#...#....#...#."],
  wavy:  [".#...#.##.#...#.", ".#....#..#....#."],
  open:  [".#.....##.....#.", ".#.....##.....#."], // a little "o" of horror
};

// Faces content.js can force, overriding the HP mood's face
const FACES = {
  scared: { eyes: "scared", mouth: "open" }, // while you doom scroll
  sleep: { eyes: "closed", mouth: "flat" },  // when you're idle
};

// Row 0 extras: wiggling stink lines when sick, a crown for elders
const STINK = ["#.#..........#.#", ".#.#........#.#."];
const CROWN = "......#.#.#.....";

const EGG = [
  "................",
  "......####......",
  ".....#....#.....",
  "....#......#....",
  "...#........#...",
  "...#........#...",
  "..#..........#..",
  "..#..#....#..#..",
  "..#..........#..",
  "..#....##....#..",
  "..#..........#..",
  "..#..........#..",
  "...#........#...",
  "....#......#....",
  ".....######.....",
  "................",
];
const EGG_CRACK = "...#..#.#...#..."; // replaces row 4 every other frame

const TOMBSTONE = [
  "................",
  "................",
  ".....######.....",
  "....#......#....",
  "...#........#...",
  "...#...##...#...",
  "...#..####..#...",
  "...#...##...#...",
  "...#...##...#...",
  "...#........#...",
  "...#........#...",
  "...#........#...",
  "...#........#...",
  "..############..",
  ".##############.",
  "................",
];

// Pick the right picture for this pet on this animation tick.
// face: optional key of FACES to override the mood's face.
function petSprite(pet, tick, face) {
  if (pet.hp <= 0) return TOMBSTONE;
  const frame = tick % 2;

  if (stageFor(pet) === "egg") {
    const rows = [...EGG];
    if (frame) rows[4] = EGG_CRACK;
    return rows;
  }

  const mood = moodFor(pet.hp);
  const look = FACES[face] ?? mood;
  const blink = tick % 6 === 0;
  const eyes = blink && look.eyes === "open" ? EYES.closed : EYES[look.eyes];
  const rows = [...BODY];
  rows[5] = eyes[0];
  rows[6] = eyes[1];
  rows[8] = MOUTHS[look.mouth][0];
  rows[9] = MOUTHS[look.mouth][1];
  if (mood.stink) rows[0] = STINK[frame];
  else if (stageFor(pet) === "elder") rows[0] = CROWN;
  return rows;
}

// ---------- Drawing ----------

const LCD_DARK = "#0f380f";

function drawRows(ctx, rows, x0, y0, cell, color = LCD_DARK) {
  ctx.fillStyle = color;
  rows.forEach((row, y) => {
    [...row].forEach((c, x) => {
      if (c === "#") ctx.fillRect(x0 + x * cell, y0 + y * cell, cell, cell);
    });
  });
}

// Draw the pet at the bottom-center of any canvas, bobbing left/right
// (or hopping up/down with hop: true). Babies are drawn smaller; dead pets don't move.
// Returns where it drew, so callers can draw extras (like tears) on top.
function drawPet(canvas, pet, tick, { face, hop = false } = {}) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const alive = pet.hp > 0;
  const fullCell = Math.floor(canvas.height / 16);
  const cell = alive && stageFor(pet) === "baby" ? Math.floor((fullCell * 2) / 3) : fullCell;
  let x = Math.floor((canvas.width - 16 * cell) / 2);
  let y = canvas.height - 16 * cell;
  if (alive && hop) y -= tick % 2 === 0 ? cell : 0;
  else if (alive) x += tick % 2 === 0 ? -cell : cell;
  drawRows(ctx, petSprite(pet, tick, face), x, y, cell);
  return { x, y, cell };
}
