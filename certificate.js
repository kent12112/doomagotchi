// Draws a 1080x1920 (Instagram Story size) death certificate for one dead pet.
// certificate.html?i=3 shows graveyard[3]; no ?i shows the most recent death.

const canvas = document.getElementById("certificate");
const ctx = canvas.getContext("2d");
const W = canvas.width;

// Write centered text, shrinking the font until it fits in maxWidth
function text(str, y, size, { bold = false, color = LCD_DARK, maxWidth = 820 } = {}) {
  do {
    ctx.font = `${bold ? "bold " : ""}${size}px monospace`;
    size -= 4;
  } while (ctx.measureText(str).width > maxWidth && size > 12);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.fillText(str, W / 2, y);
}

function formatDate(ms) {
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function draw(g) {
  const totalSeconds = Object.values(g.scroll).reduce((a, b) => a + b, 0);

  // Pink egg-colored background
  const bg = ctx.createLinearGradient(0, 0, W, canvas.height);
  bg.addColorStop(0, "#ffb3d1");
  bg.addColorStop(1, "#ff7eb3");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, canvas.height);

  text("CERTIFICATE OF DEATH", 170, 72, { bold: true, color: "#5a2a4a" });

  // Green LCD panel with a dark frame
  ctx.fillStyle = "#3a3a3a";
  ctx.beginPath();
  ctx.roundRect(70, 240, W - 140, 1380, 40);
  ctx.fill();
  ctx.fillStyle = "#9bbc0f";
  ctx.beginPath();
  ctx.roundRect(90, 260, W - 180, 1340, 28);
  ctx.fill();

  drawRows(ctx, TOMBSTONE, (W - 16 * 25) / 2, 320, 25); // 400px wide tombstone

  text(g.name.toUpperCase(), 840, 110, { bold: true });
  text(`${formatDate(g.bornAt)} – ${formatDate(g.diedAt)}`, 910, 40);

  ctx.fillStyle = LCD_DARK;
  ctx.fillRect(190, 965, W - 380, 6); // divider line

  text("LIVED", 1060, 36);
  text(formatDuration(g.diedAt - g.bornAt), 1130, 64, { bold: true });
  text("CAUSE OF DEATH", 1240, 36);
  text(`${formatScroll(g.scroll[g.killer])} of ${g.killer}`, 1310, 60, { bold: true });
  text("TOTAL DOOM SCROLLING", 1420, 36);
  text(formatScroll(totalSeconds), 1490, 64, { bold: true });

  text("DOOMAGOTCHI", 1730, 56, { bold: true, color: "#5a2a4a" });
  text("a pet that dies when you doom scroll", 1800, 34, { color: "#5a2a4a" });
}

chrome.storage.local.get("graveyard").then(({ graveyard = [] }) => {
  if (graveyard.length === 0) {
    document.getElementById("empty").hidden = false;
    return;
  }
  const i = new URLSearchParams(location.search).get("i");
  const grave = graveyard[i] ?? graveyard.at(-1); // fall back to the latest death
  draw(grave);
  canvas.hidden = false;

  const download = document.getElementById("download");
  download.hidden = false;
  download.addEventListener("click", () => {
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `${grave.name}-death-certificate.png`;
    link.click();
  });
});
