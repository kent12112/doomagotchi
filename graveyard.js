// Lists every pet you've killed, newest first

function totalSeconds(scroll) {
  return Object.values(scroll).reduce((sum, s) => sum + s, 0);
}

// Which site killed the most pets?
function topKiller(graveyard) {
  const counts = {};
  graveyard.forEach((g) => (counts[g.killer] = (counts[g.killer] ?? 0) + 1));
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

chrome.storage.local.get("graveyard").then(({ graveyard = [] }) => {
  const stats = document.getElementById("stats");
  if (graveyard.length === 0) {
    stats.textContent = "No deaths yet. Keep it that way.";
    return;
  }

  const allSeconds = graveyard.reduce((sum, g) => sum + totalSeconds(g.scroll), 0);
  stats.textContent = `${graveyard.length} pets killed · Top killer: ${topKiller(graveyard)} · ${formatDuration(allSeconds * 1000)} doom scrolled`;

  const list = document.getElementById("graves");
  graveyard.forEach((g, i) => {
    const card = document.createElement("div");
    card.className = "grave";
    card.innerHTML = `
      <canvas width="64" height="64"></canvas>
      <h2></h2>
      <p class="lived"></p>
      <p class="killer"></p>
      <p><a href="certificate.html?i=${i}">📜 Certificate</a></p>
    `;
    // textContent (not innerHTML) for the name, so a name like "<b>" can't inject HTML
    card.querySelector("h2").textContent = g.name;
    card.querySelector(".lived").textContent = `Lived ${formatDuration(g.diedAt - g.bornAt)} · died ${new Date(g.diedAt).toLocaleDateString()}`;
    card.querySelector(".killer").textContent = `Killed by ${g.killer} (${formatScroll(g.scroll[g.killer])})`;
    drawRows(card.querySelector("canvas").getContext("2d"), TOMBSTONE, 0, 0, 4);
    list.prepend(card); // prepend = newest at the top
  });
});
