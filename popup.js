// Sprites, moods and drawPet() come from pet.js (loaded first in popup.html)

const canvas = document.getElementById("pet");
const hatchForm = document.getElementById("hatch");

let pet = null;
let graveyard = [];
let tick = 0;
let confirming = false; // starting over replaces a living pet, so it takes two clicks

function render() {
  const dead = pet.hp <= 0;
  document.getElementById("hearts").textContent = heartsFor(pet.hp);
  document.getElementById("status").textContent = dead
    ? `RIP ${pet.name}. You doom scrolled it to death.`
    : `${pet.name} · ${stageFor(pet)} · ${pet.hp} HP\n${moodFor(pet.hp).text}${DEMO ? "\n🎬 demo mode" : ""}`;
  document.getElementById("hatch-button").textContent = confirming ? "Sure? ✔" : dead ? "Hatch 🥚" : "New egg 🥚";
  document.getElementById("certificate").hidden = !dead;
  document.getElementById("graveyard").textContent = `🪦 Graveyard (${graveyard.length})`;
  drawPet(canvas, pet, tick);
}

function openPage(page) {
  chrome.tabs.create({ url: chrome.runtime.getURL(page) });
}

// Hatching replaces the pet with a fresh egg. A living pet needs a second click to confirm.
hatchForm.addEventListener("submit", (e) => {
  e.preventDefault(); // stop the form from reloading the popup
  if (pet.hp > 0 && !confirming) {
    confirming = true;
    render();
    return;
  }
  confirming = false;
  chrome.storage.local.set({ pet: newPet(document.getElementById("name").value.trim()) });
});
document.getElementById("middle").addEventListener("click", () => {
  if (pet.hp <= 0) hatchForm.requestSubmit();
});

document.getElementById("certificate").addEventListener("click", () => openPage("certificate.html"));
document.getElementById("graveyard").addEventListener("click", () => openPage("graveyard.html"));

// Re-render whenever background.js changes things while the popup is open
chrome.storage.onChanged.addListener((changes) => {
  if (changes.pet) pet = changes.pet.newValue;
  if (changes.graveyard) graveyard = changes.graveyard.newValue;
  render();
});

chrome.storage.local.get(["pet", "graveyard"]).then((data) => {
  pet = data.pet ?? newPet();
  graveyard = data.graveyard ?? [];
  render();
  setInterval(() => {
    tick++;
    drawPet(canvas, pet, tick);
  }, 500);
});
