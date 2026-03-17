window.effectController = (() => {
  const overlay = () => document.getElementById("overlay");
  const sleep = (ms) => new Promise(res => setTimeout(res, ms));

  async function run(effects = []) {
    document.body.style.filter = "";

    for (const e of effects) {
      if (e === "flash_subtle") {
        overlay().style.opacity = "0.65";
        await sleep(60);
        overlay().style.opacity = "0";
        await sleep(80);
      }
      if (e === "blackout_short") {
        overlay().style.opacity = "0.92";
        await sleep(300);
        overlay().style.opacity = "0";
        await sleep(120);
      }
      if (e === "blackout_micro") {
        overlay().style.opacity = "0.85";
        await sleep(90);
        overlay().style.opacity = "0";
        await sleep(60);
      }
      if (e === "glitch_minor" || e === "glitch_rare" || e === "glitch_major") {
        const el = document.getElementById("sceneText");
        if (!el) continue;
        el.style.transform = "translateX(1px)";
        await sleep(40);
        el.style.transform = "translateX(-1px)";
        await sleep(40);
        el.style.transform = "translateX(0px)";
      }
    }
  }

  function has(effects, name) {
    return Array.isArray(effects) && effects.includes(name);
  }

  return { run, has };
})();
