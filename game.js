"use strict";

// ★ゲーム調整（速度はこれまでと同じ）
const SETTINGS = {
  seconds: 30, speed: 4.5, kissRange: 7, ohagiRange: 28, moveRange: 104,
  resultMs: 850
};
const IMAGES = {
  giyuNormal: "./images/giyu-normal.png", giyuAttack: "./images/giyu-attack.png",
  giyuKiss: "./images/giyu-kiss.png", sanemiNormal: "./images/sanemi-normal.png",
  sanemiAngry: "./images/sanemi-angry.png", sanemiKiss: "./images/sanemi-kiss.png"
};
Object.values(IMAGES).forEach(src => { const img = new Image(); img.src = src; });
const $ = id => document.getElementById(id);
const stage = $("stage"), giyu = $("giyu"), sanemi = $("sanemi");
const giyuImage = $("giyuImage"), sanemiImage = $("sanemiImage");
const action = $("action"), result = $("result"), message = $("message");
const overlay = $("heart-overlay");
const RANKING_BASE = "https://ohagi-ranking.makimaki-feed.net";
let finishedScore = 0;
let privateSaved = false;
const STORE = "ohagi-kiss-v2";
function readStored(key, fallback) {
  try { return localStorage.getItem(`${STORE}-${key}`) ?? fallback; } catch { return fallback; }
}
function saveStored(key, value) {
  try { localStorage.setItem(`${STORE}-${key}`, String(value)); } catch { /* 保存できなくても遊べる */ }
}
let best = Math.max(0, Number(readStored("best", "0")) || 0);
function readHistory() {
  try {
    const data = JSON.parse(readStored("history", "[]"));
    return Array.isArray(data) ? data.filter(n => Number.isInteger(n) && n >= 0).sort((a, b) => b - a).slice(0, 5) : [];
  } catch { return []; }
}
let history = readHistory();
let soundOn = readStored("sound", "on") !== "off";
const sounds = {};
for (const name of ["bgm", "angry", "kiss", "touchi", "shock", "whoosh"]) {
  const audio = new Audio(`./sounds/${name}.mp3`);
  audio.preload = "auto";
  audio.loop = name === "bgm";
  audio.volume = name === "bgm" ? .22 : name === "kiss" ? .65 : .8;
  sounds[name] = audio;
}
function playSound(name) {
  if (!soundOn || document.hidden) return;
  const audio = sounds[name];
  if (name !== "bgm") audio.currentTime = 0;
  const promise = audio.play();
  if (promise) promise.catch(() => { }); // 音が使えなくてもゲームは続行
}
function stopEffects() {
  Object.entries(sounds).forEach(([name, audio]) => {
    if (name !== "bgm") { audio.pause(); audio.currentTime = 0; }
  });
}
function updateSoundButton() {
  $("sound").textContent = soundOn ? "♪ 音 ON" : "♪ 音 OFF";
  $("sound").setAttribute("aria-pressed", String(soundOn));
}
$("sound").addEventListener("click", () => {
  soundOn = !soundOn;
  saveStored("sound", soundOn ? "on" : "off");
  updateSoundButton();
  if (!soundOn) { stopEffects(); sounds.bgm.pause(); }
  else if (active() || state === "finished") playSound("bgm");
});

let state = "ready", score = 0, offset = -SETTINGS.moveRange;
let phase = -Math.PI / 2, lastTime = null, deadline = 0, nextAt = 0, raf = 0;
function active() { return state === "playing" || state === "reaction"; }


let travelRange = SETTINGS.moveRange;

function draw() {
  giyu.style.top = "50%";
  giyu.style.transform =
    `translate(-50%, -50%) translate3d(0, ${offset}px, 0)`;
}

function setSanemi(mode) {
  sanemi.className = `actor ${mode}`;
  sanemiImage.src =
    mode === "angry" ? IMAGES.sanemiAngry :
      mode === "kiss" ? IMAGES.sanemiKiss :
        IMAGES.sanemiNormal;
}

function clearParticles(container) {
  container.querySelectorAll("*").forEach(el => {
    el.getAnimations().forEach(a => a.cancel());
  });
  container.replaceChildren();
}

function resetScene() {
  stage.className = "";
  $("effect").textContent = "";
  $("burst").textContent = "";
  clearParticles($("projectiles"));
  giyuImage.src = IMAGES.giyuNormal;
  setSanemi("waiting");
}

function beginAttempt() {
  travelRange = Math.max(
    0,
    Math.min(
      SETTINGS.moveRange,
      stage.clientHeight / 2 - giyu.offsetHeight / 2 - 12
    )
  );

  resetScene();
  state = "playing";
  phase = Math.random() < .5 ? -Math.PI / 2 : Math.PI / 2;
  offset = Math.sin(phase) * travelRange;
  lastTime = null;
  draw();

  result.textContent = "高さを合わせて…";
  message.textContent = "🍃「おはぎィ？」";
  action.textContent = "ストップ！";
  action.disabled = false;
}


function start() {
  action.style.visibility = "visible";
  cancelAnimationFrame(raf);
  $("ending").hidden = true;
  clearParticles(overlay);
  stopEffects();
  score = 0;
  $("score").textContent = "0";
  deadline = performance.now() + SETTINGS.seconds * 1000;
  sounds.bgm.currentTime = 0;
  playSound("bgm");
  $("hint").textContent = "ピンクの真ん中でストップ！";
  beginAttempt();
  updateClock(performance.now());
  raf = requestAnimationFrame(tick);
}
function updateClock(now) {
  const remaining = Math.max(0, (deadline - now) / 1000);
  $("time").textContent = (Math.ceil(remaining * 10) / 10).toFixed(1);
  $("timeBar").style.transform = `scaleX(${remaining / SETTINGS.seconds})`;
  $("clock").classList.toggle("urgent", remaining <= 5);
}
function tick(now) {
  if (!active()) return;
  updateClock(now);
  if (now >= deadline) { finish(); return; }
  if (state === "reaction" && now >= nextAt) beginAttempt();
  if (state === "playing") {
    if (lastTime !== null) phase += Math.min((now - lastTime) / 1000, .05) * SETTINGS.speed;
    lastTime = now;
    offset = Math.sin(phase) * travelRange;
    draw();
  }
  raf = requestAnimationFrame(tick);
}
function stop() {
  if (state !== "playing") return;
  const now = performance.now();
  if (now >= deadline) { finish(); return; }
  // 見えている位置で判定し、接近・画像・セリフ・音を同じ処理で切り替える。
  state = "reaction";
  nextAt = now + SETTINGS.resultMs;
  action.disabled = true;
  action.textContent = "つぎのおはぎ、準備中…";
  stopEffects();
  giyuImage.src = IMAGES.giyuAttack;
  const distance = Math.abs(offset);
  const mobile = matchMedia("(max-width: 600px)").matches;
  if (distance <= (mobile ? 17 : SETTINGS.kissRange)) {
    stage.className = "approach kiss";
    offset = 0;
    draw();
    giyuImage.src = IMAGES.giyuKiss;
    setSanemi("kiss");
    score++;
    $("score").textContent = score;
    $("effect").textContent = "💕";
    $("burst").textContent = "♥ CHU! +1 ♥";
    result.textContent = "ぴったり、チュッ！";
    message.textContent = "🍃「…ッ！？」";
    playSound("kiss"); playSound("touchi");
    launchHearts();
  } else if (distance <= (mobile ? 40 : SETTINGS.ohagiRange)) {
    stage.className = "approach hit";
    setSanemi("angry");
    $("effect").textContent = "💢";
    result.textContent = "いらねェ！！";
    message.textContent = "🌊「…そうか」";
    playSound("whoosh"); playSound("angry");
    throwOhagi(true);
  } else {
    // 遠すぎると接近せず、とんちんかんな場所で空振り。
    stage.className = "miss";
    setSanemi("waiting");
    result.textContent = "ぽとっ…";
    message.textContent = "🌊「…すまない」";
    playSound("whoosh"); playSound("shock");
    throwOhagi(false);
  }
}
function finish() {
  state = "finished";
  finishedScore = score;
  privateSaved = false;
  $("privateSubmit").disabled = false;
  $("recordLoginForm").hidden = true;
  $("recordStatus").textContent = "";
  cancelAnimationFrame(raf);
  updateClock(deadline);
  // BGMをそのまま流して、最後もキスの効果音とハートで祝う。
  stopEffects();
  action.disabled = false;
  action.style.visibility = "hidden";
  const record = score > best;
  best = Math.max(best, score);
  saveStored("best", best);
  history = [...history, score].sort((a, b) => b - a).slice(0, 5);
  saveStored("history", JSON.stringify(history));
  $("best").textContent = best;
  $("hint").textContent = "TIME UP!";
  result.textContent = `${score}回、チュッ！`;
  message.textContent = record ? "♥ 自己ベスト更新！ もう一回？" : `自己ベスト ${best}回 ♥ もう一回？`;
  $("endingScore").textContent = score;
  $("endingRecord").textContent = record ? `♥ 自己ベスト更新！ ${best}回 ♥` : `自己ベスト ${best}回 ♥`;
  const list = $("history");
  list.replaceChildren();
  history.forEach((n, i) => {
    const li = document.createElement("li");
    const number = document.createElement("strong");
    number.textContent = n;
    li.textContent = `${i + 1}位`;
    li.appendChild(number);
    list.appendChild(li);
  });
  $("ending").hidden = false;
  $("endingTitle").focus({ preventScroll: true });
  $("ending").scrollTop = 0;
  playSound("kiss"); playSound("touchi");
  launchHearts();
}
function animateParticle(el, frames, options) {
  if (!el.animate) { el.remove(); return; }
  const animation = el.animate(frames, { ...options, fill: "both" });
  animation.finished.then(() => el.remove(), () => el.remove());
}
function throwOhagi(hit) {
  const el = document.createElement("span");
  el.className = "ohagi";
  $("projectiles").appendChild(el);
  const width = stage.clientWidth, height = stage.clientHeight;
  const x = hit ? width * .76 - 22 : width * .24 + 22;
  const y = height / 2 + offset - 22;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  animateParticle(el, reduced ? [
    { transform: `translate(${x}px,${y}px)`, opacity: 1 },
    { transform: `translate(${x}px,${y + 20}px)`, opacity: 0 }
  ] : [
    { transform: `translate(${x}px,${y}px) rotate(0deg)`, opacity: 1 },
    { transform: `translate(${hit ? x + 70 : x + 60}px,${hit ? y - 75 : y + 30}px) rotate(180deg)`, opacity: 1, offset: .4 },
    { transform: `translate(${hit ? width + 80 : x + 145}px,${height + 50}px) rotate(600deg)`, opacity: .6 }
  ], { duration: 620, easing: "ease-in" });
}
function launchHearts() {
  // 前のハートを消さずに漂わせる。連続成功でも最大240個に制限。
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mobile = matchMedia("(max-width: 600px)").matches;
  const count = reduced ? 12 : mobile ? 22 : 90;
  const limit = mobile ? 44 : 240;

  while (overlay.children.length + count > limit) {
    const first = overlay.firstElementChild;
    first.getAnimations().forEach(a => a.cancel()); first.remove();
  }
  const rect = sanemi.getBoundingClientRect();
  const ox = rect.left + rect.width * .2, oy = rect.top + rect.height * .35;
  const colors = ["#ff3788", "#ff71ad", "#ffc0dc", "#e62d78", "#ff94c6", "#fff0f7"];
  for (let i = 0; i < count; i++) {
    const heart = document.createElement("span");
    heart.className = "flying-heart";
    heart.textContent = i % 5 ? "♥" : "♡";
    const size = 24 + Math.random() * 48;
    heart.style.fontSize = `${size}px`;
    heart.style.color = colors[i % colors.length];
    overlay.appendChild(heart);
    const x = Math.random() * Math.max(1, innerWidth - size);
    const y = Math.random() * innerHeight;
    const sway = (30 + Math.random() * 55) * (Math.random() < .5 ? 1 : -1);
    const fromCouple = i < Math.ceil(count * 0.45);
    const transform = (a, b, r = 0, s = 1) => `translate(${a}px,${b}px) rotate(${r}deg) scale(${s})`;
    const frames = reduced ? [
      { transform: transform(x, y), opacity: 0 },
      { transform: transform(x, y), opacity: .65, offset: .3 },
      { transform: transform(x, y), opacity: 0 }
    ] : [
      { transform: transform(fromCouple ? ox : x, fromCouple ? oy : innerHeight + size, 0, .2), opacity: 0 },
      { transform: transform(x, y, -12), opacity: .85, offset: .28 },
      { transform: transform(x + sway, y - 65, 12, 1.1), opacity: .85, offset: .48 },
      { transform: transform(x - sway, y - 140, -15), opacity: .8, offset: .7 },
      { transform: transform(x + sway, y - 240, 12), opacity: .5, offset: .88 },
      { transform: transform(x, y - 340, 0, .85), opacity: 0 }
    ];
    animateParticle(heart, frames, {
      duration: reduced ? 1800 : 4200 + Math.random() * 1800,
      delay: reduced ? 0 : fromCouple ? Math.random() * 250 : 250 + Math.random() * 1100, easing: "ease-in-out"
    });
  }
}
function activate() {
  if (state === "playing") stop();
  else if (state === "ready" || state === "finished") start();
}
action.addEventListener("click", activate);
$("playAgain").addEventListener("click", start);

$("privateSubmit").addEventListener("click", async () => {
  if (state !== "finished" || privateSaved) return;

  const button = $("privateSubmit");
  const status = $("recordStatus");
  button.disabled = true;
  status.textContent = "ログインを確認中…";

  try {
    const me = await fetch(`${RANKING_BASE}/api/me`, {
      credentials: "include"
    });

    if (me.status === 401) {
      $("recordLoginForm").hidden = false;
      status.textContent = "Blueskyのハンドルを入力してね";
      button.disabled = false;
      return;
    }
    if (!me.ok) throw new Error(`ログイン確認失敗: ${me.status}`);

    const response = await fetch(`${RANKING_BASE}/api/my-scores`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game: "kiss", score: finishedScore })
    });
    if (!response.ok) throw new Error(`保存失敗: ${response.status}`);

    privateSaved = true;
    status.textContent = "自分の記録に保存したよ ♥";
  } catch (error) {
    button.disabled = false;
    status.textContent = "保存できませんでした。通信を確認してね。";
    console.error(error);
  }
});

$("recordLoginForm").addEventListener("submit", event => {
  event.preventDefault();

  const handle = $("recordHandle").value.trim().replace(/^[@＠]+/, "");
  if (!handle.includes(".") || /\s/.test(handle)) {
    $("recordStatus").textContent = "Blueskyのハンドルを確認してね";
    return;
  }

  const query = new URLSearchParams({
    handle,
    game: "kiss",
    score: String(finishedScore)
  });
  window.location.assign(`${RANKING_BASE}/login?${query}`);
});

$("shareResult").addEventListener("click", () => {
  const text = `おはぎKISSで ${score}回キス！💋\n\n#おはぎKISS`;
  const url = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
  window.open(url, "_blank", "noopener,noreferrer");
});
stage.addEventListener("pointerdown", event => {
  if (event.isPrimary === false || event.button > 0) return;
  event.preventDefault(); activate();
});
stage.addEventListener("keydown", event => {
  if (event.code === "Enter") { event.preventDefault(); if (!event.repeat) activate(); }
});
document.addEventListener("keydown", event => {
  if (event.code !== "Space" || event.target === $("sound")) return;
  if (state === "finished" && event.target === $("playAgain")) return;
  event.preventDefault(); if (!event.repeat) activate();
});
document.addEventListener("visibilitychange", () => {
  lastTime = null;
  if (document.hidden) { sounds.bgm.pause(); stopEffects(); }
  else if (active()) {
    if (performance.now() >= deadline) finish();
    else playSound("bgm");
  } else if (state === "finished") playSound("bgm");
});
$("best").textContent = best;
updateSoundButton();
draw();
