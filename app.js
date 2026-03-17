/* BUILD_ID: CRYOTEST_APP_JS_STATIC_2026-03-17 */

const SCENES_URL = "./CRYOTEST/backend/scenes.json";
const SOUND_KEY = "cryotest_sound_on";

const sceneTextWrap = document.getElementById("sceneTextWrap");
const sceneText = document.getElementById("sceneText");
const fallbackTextWrap = document.getElementById("fallbackTextWrap");
const fallbackText = document.getElementById("fallbackText");
const sceneImageWrap = document.getElementById("sceneImageWrap");
const sceneImageEl = document.getElementById("sceneImage");
const choiceDock = document.getElementById("choiceDock");
const choiceGrid = document.getElementById("choiceGrid");
const fallbackDock = document.getElementById("fallbackDock");
const fallbackGrid = document.getElementById("fallbackGrid");
const audioModal = document.getElementById("audioModal");
const audioYes = document.getElementById("audioYes");
const audioNo = document.getElementById("audioNo");
const soundBtn = document.getElementById("soundBtn");
const soundBtnFallback = document.getElementById("soundBtnFallback");
const overlayEl = document.getElementById("overlay");
const buildEl = document.getElementById("buildId");
const gameWrap = document.getElementById("gameWrap");

if (buildEl) buildEl.textContent = "BUILD_ID: CRYOTEST_APP_JS_STATIC_2026-03-17";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class SceneStore {
  constructor(data) {
    this.data = data;
    this.rules = data.rules || {};
    this.entry = data.entry;
    this.scenesById = new Map((data.scenes || []).map((s) => [s.id, s]));
  }

  get(id) {
    const scene = this.scenesById.get(id);
    if (!scene) throw new Error(`Scene not found: ${id}`);
    return scene;
  }

  dominanceCheck(stats) {
    const dom = this.rules.dominance || {};
    const threshold = Number(dom.threshold ?? 6);
    const leadBy = Number(dom.leadBy ?? 2);
    const sorted = Object.entries(stats).sort((a, b) => b[1] - a[1]);
    const [topName, topVal] = sorted[0];
    const secondVal = sorted[1] ? sorted[1][1] : -1e9;
    if (topVal >= threshold && topVal - secondVal >= leadBy) return [true, topName];
    return [false, null];
  }

  maxCycles() {
    return Number(this.rules.maxCycles ?? 5);
  }

  pickCycleEntry(cycle) {
    if (cycle === 1 && this.entry) return this.entry;
    if (cycle === 2 && this.scenesById.has("c2_capsule_wake_v2")) return "c2_capsule_wake_v2";
    return this.entry || "c1_capsule_wake";
  }

  maybeInjectAnomaly(cycle) {
    if (cycle <= 1 || cycle >= 5) return null;
    const chance = { 2: 0.08, 3: 0.12, 4: 0.1 }[cycle] || 0;
    if (Math.random() > chance) return null;
    const anomalies = [...this.scenesById.values()].filter((s) => s.type === "anomaly");
    if (!anomalies.length) return null;
    return anomalies[Math.floor(Math.random() * anomalies.length)].id;
  }
}

class Engine {
  constructor(store) {
    this.store = store;
    this.reset(true);
  }

  reset(full = true) {
    if (full || !this.state) {
      this.state = {
        cycle: 1,
        stats: { fear: 0, control: 0, logic: 0, trust: 0 },
        current_scene_id: "",
        ended: false,
        last_scene_id: null,
      };
    }
    this.state.ended = false;
    this.state.last_scene_id = null;
    this.state.current_scene_id = this.store.pickCycleEntry(this.state.cycle);
  }

  applyDelta(delta = {}) {
    Object.entries(delta).forEach(([k, v]) => {
      if (Object.prototype.hasOwnProperty.call(this.state.stats, k)) this.state.stats[k] += Number(v);
    });
  }

  roleFromDom(dom) {
    return {
      fear: "Sentinel / Threat Monitor",
      control: "Protocol Officer",
      logic: "Systems Analyst",
      trust: "Crew Liaison",
    }[dom] || "Undeclared";
  }

  endCycle() {
    const [done, dom] = this.store.dominanceCheck(this.state.stats);
    if (done) {
      this.state.ended = true;
      this.state.current_scene_id = `system_final_${dom}`;
      return;
    }
    this.state.cycle += 1;
    if (this.state.cycle > this.store.maxCycles()) {
      const maxDom = Object.entries(this.state.stats).sort((a, b) => b[1] - a[1])[0][0];
      this.state.ended = true;
      this.state.current_scene_id = `system_final_${maxDom}`;
      return;
    }
    this.state.current_scene_id = this.store.pickCycleEntry(this.state.cycle);
  }

  getRenderScene() {
    const sid = this.state.current_scene_id;
    if (sid.startsWith("system_final_")) {
      const dom = sid.replace("system_final_", "");
      return {
        id: sid,
        cycle: this.state.cycle,
        text: `ТЕСТ ЗАВЕРШЁН.\nОбъект: Клон №47.\nНазначение: ${this.roleFromDom(dom)}`,
        effects: ["sterile_silence", "light_white"],
        choices: [{ text: "Завершить", next: "system_restart", delta: {} }],
        meta: { ended: true, dominant: dom, stats: { ...this.state.stats } },
      };
    }
    if (sid === "system_restart") {
      return {
        id: sid,
        cycle: this.state.cycle,
        text: "Следующий.",
        effects: ["flash_subtle"],
        choices: [{ text: "Начать заново", next: "system_reset_full", delta: {} }],
        meta: { ended: true, stats: { ...this.state.stats } },
      };
    }
    if (sid === "system_reset_full") {
      this.reset(true);
      return this.getRenderScene();
    }

    const scene = { ...this.store.get(sid) };
    scene.meta = {
      ...(scene.meta || {}),
      cycle: this.state.cycle,
      stats: { ...this.state.stats },
      ended: this.state.ended,
    };
    return scene;
  }

  choose(choiceIndex) {
    const sid = this.state.current_scene_id;
    if (sid.startsWith("system_final_")) {
      this.state.current_scene_id = "system_restart";
      return this.getRenderScene();
    }
    if (sid === "system_restart") {
      this.state.current_scene_id = "system_reset_full";
      return this.getRenderScene();
    }

    const scene = this.store.get(sid);
    const choices = scene.choices || [];
    if (!choices.length) {
      this.endCycle();
      return this.getRenderScene();
    }
    if (choiceIndex < 0 || choiceIndex >= choices.length) throw new Error("Invalid choice index");

    const choice = choices[choiceIndex];
    this.applyDelta(choice.delta || {});
    this.state.last_scene_id = sid;

    if (choice.next === "system_cycle_end") {
      const anomaly = this.store.maybeInjectAnomaly(this.state.cycle);
      if (anomaly) {
        this.state.current_scene_id = anomaly;
        return this.getRenderScene();
      }
      this.endCycle();
      return this.getRenderScene();
    }

    if (!choice.next) {
      this.endCycle();
      return this.getRenderScene();
    }

    this.state.current_scene_id = choice.next;
    return this.getRenderScene();
  }
}

let engine = null;

async function initEngine() {
  const response = await fetch(SCENES_URL, { cache: "no-store" });
  const data = await response.json();
  engine = new Engine(new SceneStore(data));
}

function setText(text, fallback) {
  if (sceneTextWrap) sceneTextWrap.style.display = fallback ? "none" : "block";
  if (fallbackTextWrap) fallbackTextWrap.style.display = fallback ? "block" : "none";
  if (sceneText) sceneText.textContent = fallback ? "" : text || "";
  if (fallbackText) fallbackText.textContent = fallback ? text || "" : "";
}

function clearChoices() {
  if (choiceGrid) choiceGrid.innerHTML = "";
  if (fallbackGrid) fallbackGrid.innerHTML = "";
}

function mapAssetPath(file, kind) {
  if (!file) return "";
  if (file.includes("/")) return file;
  return kind === "image" ? `./assets/scenes/${file}` : `./assets/${file}`;
}

function renderImage(scene) {
  const src = mapAssetPath((scene.image || "").trim(), "image");
  if (!src || !sceneImageEl || !sceneImageWrap) {
    if (sceneImageWrap) sceneImageWrap.style.display = "none";
    return false;
  }
  sceneImageEl.src = src;
  sceneImageWrap.style.display = "block";
  return true;
}

function mountChoices(scene, hasImage) {
  clearChoices();
  const target = hasImage ? choiceGrid : fallbackGrid;
  if (choiceDock) choiceDock.style.display = hasImage ? "flex" : "none";
  if (fallbackDock) fallbackDock.style.display = hasImage ? "none" : "block";
  (scene.choices || []).forEach((choice, idx) => {
    const btn = document.createElement("button");
    btn.className = "choiceBtn";
    btn.textContent = choice.text;
    btn.onclick = async () => {
      if (overlayEl) overlayEl.style.opacity = "1";
      await sleep(140);
      const next = engine.choose(idx);
      await renderScene(next);
      if (overlayEl) overlayEl.style.opacity = "0";
    };
    target?.appendChild(btn);
  });
}

async function applySceneAudio(scene) {
  const audio = scene.audio || {};
  const loop = mapAssetPath((audio.sceneLoop || "").trim(), "audio");
  if (!loop || !window.__audioCtx || localStorage.getItem(SOUND_KEY) !== "1") return;
}

async function renderScene(scene) {
  const hasImage = renderImage(scene);
  setText(scene.text || "", !hasImage);
  mountChoices(scene, hasImage);
  if (window.effectController?.run) await window.effectController.run(scene.effects || []);
  await applySceneAudio(scene);
}

function syncSoundButtonUI() {
  [soundBtn, soundBtnFallback].forEach((btn) => {
    if (!btn) return;
    btn.classList.toggle("active", localStorage.getItem(SOUND_KEY) === "1");
  });
}

function bindSoundButton(btn) {
  if (!btn) return;
  btn.onclick = () => {
    const next = localStorage.getItem(SOUND_KEY) === "1" ? "0" : "1";
    localStorage.setItem(SOUND_KEY, next);
    syncSoundButtonUI();
  };
}

async function startGame() {
  if (!engine) await initEngine();
  await renderScene(engine.getRenderScene());
  if (gameWrap) gameWrap.style.visibility = "visible";
  if (overlayEl) overlayEl.style.opacity = "0";
}

async function init() {
  bindSoundButton(soundBtn);
  bindSoundButton(soundBtnFallback);
  syncSoundButtonUI();
  if (localStorage.getItem(SOUND_KEY) === null && audioModal) {
    audioModal.style.display = "flex";
  } else {
    await startGame();
  }
}

audioYes && (audioYes.onclick = async () => {
  localStorage.setItem(SOUND_KEY, "1");
  if (audioModal) audioModal.style.display = "none";
  syncSoundButtonUI();
  await startGame();
});

audioNo && (audioNo.onclick = async () => {
  localStorage.setItem(SOUND_KEY, "0");
  if (audioModal) audioModal.style.display = "none";
  syncSoundButtonUI();
  await startGame();
});

init();
