/* BUILD_ID: CRYOTEST_APP_JS_2026-03-16_UI_STAGE_B_FIX_03 */

const API_SCENE = "/api/scene";
const API_CHOOSE = "/api/choose";

// ===== DOM (UI stage layout) =====
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

const gameWrap = document.getElementById("gameWrap");

const soundBtn = document.getElementById("soundBtn");
const soundBtnFallback = document.getElementById("soundBtnFallback");
const overlayEl = document.getElementById("overlay");
const buildEl = document.getElementById("buildId");

if (buildEl) buildEl.textContent = "BUILD_ID: CRYOTEST_APP_JS_2026-03-16_UI_STAGE_B_FIX_03";

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

function safeShow(el, display="block"){
  if(!el) return;
  el.style.display = display;
}
function safeHide(el){
  if(!el) return;
  el.style.display = "none";
}
function safeSetText(el, txt){
  if(!el) return;
  el.textContent = txt;
}

// ===== Cold fade (overlay) =====
async function coldFadeTo(opacity, ms){
  if(!overlayEl) return;
  overlayEl.style.transitionDuration = ms + "ms";
  overlayEl.style.opacity = String(opacity);
  await sleep(ms);
}
async function coldFadeIn(ms=180){ await coldFadeTo(1, ms); }
async function coldFadeOut(ms=240){ await coldFadeTo(0, ms); }

const SOUND_KEY = "cryotest_sound_on";

// ===== AUDIO (WebAudio) =====
let audioCtx = null;
let master = null;

let gameAmbGain = null;
let gameSource = null;

let sceneLoopGain = null;
let sceneLoopSource = null;
let currentLoopFile = "";
let loopChangeToken = 0;

let clickBuffer = null;
let onceGain = null;

let activeSceneId = null;

const VOL = {
  master: 0.95,
  gameAmb: 0.18,
  loop: 0.26,
  once: 0.55,
  click: 0.22,
};

function isSoundEnabled(){
  return localStorage.getItem(SOUND_KEY) === "1";
}
function setSoundEnabled(v){
  localStorage.setItem(SOUND_KEY, v ? "1" : "0");
}
function now(){
  return audioCtx.currentTime;
}
function fade(gainNode, to, ms){
  if(!gainNode) return;
  const t = now();
  try{
    gainNode.gain.cancelScheduledValues(t);
    gainNode.gain.setValueAtTime(gainNode.gain.value, t);
    gainNode.gain.linearRampToValueAtTime(to, t + ms/1000);
  }catch(e){}
}
function stopSource(src){
  if(!src) return;
  try{ src.stop(0); }catch(e){}
  try{ src.disconnect(); }catch(e){}
}
async function fetchArrayBuffer(url){
  const r = await fetch(url, { cache: "no-store" });
  return await r.arrayBuffer();
}
async function decodeAudio(url){
  const arr = await fetchArrayBuffer(url);
  return await audioCtx.decodeAudioData(arr);
}

async function initAudio(){
  if(audioCtx) return;

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  master = audioCtx.createGain();
  master.gain.value = 0; // стартуем с 0, поднимем если звук включен
  master.connect(audioCtx.destination);

  gameAmbGain = audioCtx.createGain();
  gameAmbGain.gain.value = 0;
  gameAmbGain.connect(master);

  sceneLoopGain = audioCtx.createGain();
  sceneLoopGain.gain.value = 0;
  sceneLoopGain.connect(master);

  onceGain = audioCtx.createGain();
  onceGain.gain.value = 1;
  onceGain.connect(master);

  try{
    clickBuffer = await decodeAudio("./assets/ui_click.mp3");
  }catch(e){
    // ok
  }
}

// гарантированный глобальный mute/unmute
function hardMute(on){
  if(!master) return;
  if(on) fade(master, 0.0, 140);
  else fade(master, VOL.master, 240);
}

// ===== GAME AMBIENCE =====
async function startGameAmbience(){
  if(!isSoundEnabled()) return;
  await initAudio();
  if(gameSource) return;

  let buf = null;
  try{
    buf = await decodeAudio("./assets/game_ambience.mp3");
  }catch(e){
    return;
  }

  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.connect(gameAmbGain);

  gameSource = src;
  src.start(0);

  fade(gameAmbGain, VOL.gameAmb, 420);
}

function stopGameAmbience(){
  if(!gameAmbGain) return;

  const old = gameSource;
  fade(gameAmbGain, 0.0, 350);
  gameSource = null;

  setTimeout(()=> stopSource(old), 380);
}

// ===== DUCKING =====
function setDucking(on){
  if(!gameAmbGain) return;
  const target = on ? (VOL.gameAmb * 0.55) : VOL.gameAmb;
  fade(gameAmbGain, target, 220);
}

// ===== SCENE LOOP =====
async function setSceneLoop(loopFile){
  await initAudio();
  loopFile = (loopFile || "").trim();
  const token = ++loopChangeToken;

  if(loopFile && loopFile === currentLoopFile && sceneLoopSource){
    return;
  }

  if(sceneLoopSource){
    fade(sceneLoopGain, 0.0, 320);
    const old = sceneLoopSource;
    sceneLoopSource = null;
    currentLoopFile = "";

    setTimeout(()=> setDucking(false), 140);
    setTimeout(()=> stopSource(old), 360);
    await sleep(220);
  }

  if(!loopFile){
    currentLoopFile = "";
    return;
  }

  if(!isSoundEnabled()){
    currentLoopFile = loopFile;
    return;
  }

  let buf = null;
  try{
    const url = loopFile.includes("/") ? loopFile : ("./assets/" + loopFile);
    buf = await decodeAudio(url);
  }catch(e){
    return;
  }

  if(token !== loopChangeToken) return;

  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.connect(sceneLoopGain);

  sceneLoopSource = src;
  currentLoopFile = loopFile;

  setDucking(true);
  src.start(0);
  fade(sceneLoopGain, VOL.loop, 420);
}

// ===== ONE-SHOT =====
async function playOnce(file, vol=VOL.once){
  if(!isSoundEnabled()) return;
  await initAudio();

  let buf = null;
  try{
    const url = file.includes("/") ? file : ("./assets/" + file);
    buf = await decodeAudio(url);
  }catch(e){
    return;
  }

  const src = audioCtx.createBufferSource();
  src.buffer = buf;

  const g = audioCtx.createGain();
  g.gain.value = vol;

  src.connect(g);
  g.connect(onceGain);

  src.start(0);
  setTimeout(()=> stopSource(src), 5000);
}

let lastClickAt = 0;
async function playClick(){
  if(!isSoundEnabled()) return;
  await initAudio();
  if(!clickBuffer) return;

  const t = Date.now();
  if(t - lastClickAt < 60) return;
  lastClickAt = t;

  const src = audioCtx.createBufferSource();
  src.buffer = clickBuffer;

  const g = audioCtx.createGain();
  g.gain.value = VOL.click;

  src.connect(g);
  g.connect(master);

  src.start(0);
  setTimeout(()=> stopSource(src), 500);
}

// ===== SOUND TOGGLE (HUD) =====
function syncSoundButtonUI(){
  [soundBtn, soundBtnFallback].forEach((btn)=>{
    if(!btn) return;
    if(isSoundEnabled()) btn.classList.add("active");
    else btn.classList.remove("active");
  });
}

async function toggleSound(){
  const enabled = isSoundEnabled();

  if(enabled){
    setSoundEnabled(false);
    syncSoundButtonUI();

    hardMute(true);
    stopGameAmbience();
    await setSceneLoop("");
    currentLoopFile = "";

  } else {
    setSoundEnabled(true);
    syncSoundButtonUI();

    await initAudio();
    hardMute(false);

    await startGameAmbience();

    if(window.__lastSceneAudio && window.__lastSceneAudio.sceneLoop){
      await setSceneLoop(window.__lastSceneAudio.sceneLoop);
    }
  }
}

function bindSoundButton(btn){
  if(!btn) return;
  btn.onclick = async ()=>{
    await playClick();
    await toggleSound();
  };
}

bindSoundButton(soundBtn);
bindSoundButton(soundBtnFallback);

// ===== API =====
async function fetchScene(){
  const r = await fetch(API_SCENE, { cache: "no-store" });
  return r.json();
}
async function choose(index){
  const r = await fetch(API_CHOOSE,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({index})
  });
  return r.json();
}

// ===== UI helpers =====
function setSceneText(text, mode="image"){
  const t = (text || "").trim();

  if(sceneTextWrap) sceneTextWrap.style.display = "none";
  if(fallbackTextWrap) fallbackTextWrap.style.display = "none";
  if(sceneText) sceneText.textContent = "";
  if(fallbackText) fallbackText.textContent = "";

  if(!t) return;

  if(mode === "fallback"){
    if(fallbackText) fallbackText.textContent = t;
    if(fallbackTextWrap) fallbackTextWrap.style.display = "block";
    return;
  }

  if(sceneText) sceneText.textContent = t;
  if(sceneTextWrap) sceneTextWrap.style.display = "block";
}

function setImageVisible(on){
  if(!sceneImageWrap) return;
  sceneImageWrap.style.display = on ? "block" : "none";
}

function setChoiceMode(mode){
  // mode: "image" | "fallback"
  const inImage = (mode === "image");

  if(choiceDock) choiceDock.style.display = inImage ? "flex" : "none";
  if(fallbackDock) fallbackDock.style.display = inImage ? "none" : "block";
}

function clearChoices(){
  if(choiceGrid) choiceGrid.innerHTML = "";
  if(fallbackGrid) fallbackGrid.innerHTML = "";
}

function makeChoiceButton(c, idx){
  const btn = document.createElement("button");
  btn.className = "choiceBtn";
  btn.textContent = c.text;

  btn.onclick = async () => {
    await playClick();

    // если overlay отсутствует — просто без фейда
    if(overlayEl) await coldFadeIn(170);

    const next = await choose(idx);
    await renderScene(next);

    if(overlayEl) await coldFadeOut(240);
  };

  return btn;
}

function mountChoiceButtons(choices, targetGrid){
  if(!targetGrid) return;
  (choices || []).forEach((c, idx) => {
    targetGrid.appendChild(makeChoiceButton(c, idx));
  });
}

// ===== IMAGE drift fallback =====
function forceImageFloat(){
  if(!sceneImageEl) return;
  sceneImageEl.style.animation = "sceneFloat 24s ease-in-out infinite";
  sceneImageEl.style.willChange = "transform";
}

function setImageOrientationClass(width, height){
  if(!sceneImageEl) return;
  sceneImageEl.classList.remove("is-portrait", "is-landscape");
  if(!width || !height) return;
  if(height > width){
    sceneImageEl.classList.add("is-portrait");
  }else{
    sceneImageEl.classList.add("is-landscape");
  }
}

// ===== RENDER =====
function renderSceneImage(scene){
  const img = (scene.image || "").trim();
  if(img && sceneImageEl){
    const src = img.includes("/") ? img : ("./assets/scenes/" + img);
    sceneImageEl.classList.remove("is-portrait", "is-landscape");
    sceneImageEl.onload = () => {
      setImageOrientationClass(sceneImageEl.naturalWidth, sceneImageEl.naturalHeight);
      forceImageFloat();
    };
    sceneImageEl.src = src;
    setImageVisible(true);

    if(sceneImageEl.complete){
      setImageOrientationClass(sceneImageEl.naturalWidth, sceneImageEl.naturalHeight);
      forceImageFloat();
    }
    return true;
  }
  setImageVisible(false);
  return false;
}

async function applySceneAudio(scene){
  const audio = scene.audio || {};
  const sceneLoop = (audio.sceneLoop || "").trim();
  const sceneOnce = (audio.sceneOnce || "").trim();

  window.__lastSceneAudio = { sceneLoop, sceneOnce };

  await setSceneLoop(sceneLoop);

  if(scene.id && scene.id !== activeSceneId){
    if(sceneOnce){
      await playOnce(sceneOnce, VOL.once);
    }
    activeSceneId = scene.id;
  }
}

async function renderScene(scene){
  // 1) image
  const hasImage = renderSceneImage(scene);

  // 2) text
  setSceneText(scene.text || "", hasImage ? "image" : "fallback");

  // 3) choices
  clearChoices();

  // если вдруг нет обоих контейнеров — не ломаемся, просто не покажем кнопки
  if(hasImage){
    setChoiceMode("image");
    mountChoiceButtons(scene.choices || [], choiceGrid || fallbackGrid);
  }else{
    setChoiceMode("fallback");
    mountChoiceButtons(scene.choices || [], fallbackGrid || choiceGrid);
  }

  // 4) effects (если controller не загрузился — просто пропустим)
  const effects = scene.effects || [];
  if(window.effectController && typeof window.effectController.run === "function"){
    await window.effectController.run(effects);
  }

  // 5) audio
  await applySceneAudio(scene);
}

// ===== START =====
async function startGame(){
  const scene = await fetchScene();
  await renderScene(scene);

  if(gameWrap) gameWrap.style.visibility = "visible";

  const fromMenu = sessionStorage.getItem("cryotest_transition") === "1";
  if(fromMenu){
    sessionStorage.removeItem("cryotest_transition");
    if(overlayEl) await coldFadeOut(260);
  }else{
    if(overlayEl) overlayEl.style.opacity = "0";
  }
}

async function handleAudioChoice(enable){
  setSoundEnabled(enable);
  if(audioModal) audioModal.style.display = "none";

  await initAudio();
  if(enable){
    hardMute(false);
    await startGameAmbience();
  }else{
    hardMute(true);
  }

  syncSoundButtonUI();
  await startGame();
}

async function init(){
  const saved = localStorage.getItem(SOUND_KEY);

  const fromMenu = sessionStorage.getItem("cryotest_transition") === "1";
  if(fromMenu && overlayEl){
    overlayEl.style.transitionDuration = "0ms";
    overlayEl.style.opacity = "1";
  }

  syncSoundButtonUI();

  if(saved === null){
    if(audioModal) audioModal.style.display = "flex";
  }else{
    await initAudio();
    if(saved === "1"){
      hardMute(false);
      await startGameAmbience();
    }else{
      hardMute(true);
    }
    await startGame();
  }
}

if(audioYes) audioYes.onclick = () => handleAudioChoice(true);
if(audioNo)  audioNo.onclick  = () => handleAudioChoice(false);

init();