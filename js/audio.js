// Âm thanh: nhạc nền nhẹ + hiệu ứng (nhận tiền, trừ tiền, khách bực bỏ về).
// Toàn bộ âm thanh được tổng hợp bằng Web Audio API — không cần file nhạc.
import { game } from './state.js';

let ctx = null, master, musicBus, sfxBus, reverb;
let muted = false;
try { muted = localStorage.getItem('nh3d_muted') === '1'; } catch { /* bỏ qua */ }

const MUSIC_VOL = 0.55, SFX_VOL = 0.9;

// Trình duyệt chỉ cho phát âm thanh sau khi người chơi click/bấm phím
export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = muted ? 0 : 1; master.connect(ctx.destination);
  musicBus = ctx.createGain(); musicBus.gain.value = MUSIC_VOL;
  sfxBus = ctx.createGain(); sfxBus.gain.value = SFX_VOL; sfxBus.connect(master);
  // hồi âm nhẹ cho nhạc
  reverb = ctx.createConvolver(); reverb.buffer = impulse(2.4);
  const wet = ctx.createGain(); wet.gain.value = 0.35;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
  musicBus.connect(lp); lp.connect(master); lp.connect(reverb); reverb.connect(wet); wet.connect(master);
  startMusic();
}

export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('nh3d_muted', muted ? '1' : '0'); } catch { /* bỏ qua */ }
  if (master) master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.05);
  if (muted && window.speechSynthesis) speechSynthesis.cancel();
  return muted;
}
export const isMuted = () => muted;

function impulse(sec) {
  const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
  }
  return b;
}

const freq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// Một nốt đơn: osc + bao hình ADSR
function note(bus, midi, t, dur, { type = 'sine', vol = 0.2, attack = 0.01, release = 0.3, detune = 0, slideTo = null } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq(midi), t); o.detune.value = detune;
  if (slideTo != null) o.frequency.exponentialRampToValueAtTime(freq(slideTo), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.setTargetAtTime(0.0001, t + Math.max(attack, dur - release * 0.3), release / 3);
  o.connect(g); g.connect(bus);
  o.start(t); o.stop(t + dur + release * 2);
}

// ===== Nhạc nền: vòng hợp âm jazz nhẹ, 72 BPM, đàn điện + pad + bass =====
const BPM = 72, BEAT = 60 / BPM;
const CHORDS = [ // Cmaj7 – Am9 – Dm9 – G13 (gốc MIDI + các nốt)
  { bass: 36, notes: [52, 55, 59, 64] },
  { bass: 45, notes: [52, 55, 59, 60] },
  { bass: 38, notes: [53, 57, 60, 64] },
  { bass: 43, notes: [53, 57, 59, 64] },
  { bass: 41, notes: [52, 57, 60, 64] }, // Fmaj7
  { bass: 40, notes: [52, 55, 59, 62] }, // Em7
  { bass: 38, notes: [53, 57, 60, 65] }, // Dm7
  { bass: 43, notes: [53, 55, 59, 62] }, // G7
];
const MELODY = [ // giai điệu thưa, mỗi phần tử: [nhịp trong ô nhịp, nốt] cho từng hợp âm
  [[0, 76], [1.5, 74], [2.5, 72]], [[0.5, 72], [2, 71]], [[0, 69], [1, 72], [2.5, 74]], [[1, 71], [2.5, 67]],
  [[0, 72], [1.5, 76], [3, 79]], [[1, 76], [2, 74]], [[0, 77], [1.5, 76], [2.5, 74]], [[0.5, 71], [2, 74]],
];
let bar = 0, nextBarTime = 0, timer = null;

function scheduleBar(t) {
  const c = CHORDS[bar % CHORDS.length];
  // nhạc nhẹ hơn vào ban đêm
  const night = game.night || 0;
  const v = 0.9 - night * 0.35;
  // pad
  for (const n of c.notes) note(musicBus, n, t, BEAT * 4, { type: 'triangle', vol: 0.028 * v, attack: 0.8, release: 1.6, detune: (Math.random() - 0.5) * 8 });
  // bass
  note(musicBus, c.bass, t, BEAT * 1.8, { type: 'sine', vol: 0.11 * v, attack: 0.02, release: 0.6 });
  note(musicBus, c.bass + 7, t + BEAT * 2.5, BEAT * 1.2, { type: 'sine', vol: 0.07 * v, attack: 0.02, release: 0.5 });
  // đàn điện rải hợp âm
  const arp = [0, 1, 2, 3, 2, 1];
  arp.forEach((k, i) => {
    const swing = i % 2 ? 0.08 : 0;
    note(musicBus, c.notes[k] + 12, t + (i * 0.66 + swing) * BEAT, BEAT * 0.9, { type: 'sine', vol: 0.035 * v, attack: 0.005, release: 0.7 });
  });
  // giai điệu (lặp lại mỗi 8 ô nhịp, đôi khi nghỉ cho thoáng)
  if ((Math.floor(bar / 8) % 3) !== 2) {
    for (const [b, n] of MELODY[bar % MELODY.length]) {
      note(musicBus, n, t + b * BEAT, BEAT * 1.2, { type: 'sine', vol: 0.05 * v, attack: 0.01, release: 0.9 });
      note(musicBus, n + 12, t + b * BEAT, BEAT * 0.5, { type: 'sine', vol: 0.008 * v, attack: 0.005, release: 0.4 }); // tiếng chuông nhẹ
    }
  }
  bar++;
}

function startMusic() {
  nextBarTime = ctx.currentTime + 0.3;
  timer = setInterval(() => {
    while (nextBarTime < ctx.currentTime + 1.0) { scheduleBar(nextBarTime); nextBarTime += BEAT * 4; }
  }, 200);
}

// ===== Hiệu ứng =====
function ok() { return ctx && !muted && ctx.state === 'running'; }

export function sfxCoin(amount = 10) {
  if (!ok()) return;
  const t = ctx.currentTime;
  const seq = amount >= 30 ? [83, 88, 95] : [83, 88];
  seq.forEach((m, i) => {
    note(sfxBus, m, t + i * 0.07, 0.25, { type: 'square', vol: 0.05, attack: 0.002, release: 0.25 });
    note(sfxBus, m, t + i * 0.07, 0.3, { type: 'sine', vol: 0.12, attack: 0.002, release: 0.35 });
  });
  // lấp lánh
  note(sfxBus, 100, t + seq.length * 0.07, 0.15, { type: 'sine', vol: 0.04, attack: 0.002, release: 0.3 });
}

export function sfxSpend() {
  if (!ok()) return;
  const t = ctx.currentTime;
  // tiếng "cạch" của máy tính tiền
  const n = ctx.createBufferSource(), b = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
  const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  n.buffer = b; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800;
  const g = ctx.createGain(); g.gain.value = 0.25; n.connect(bp); bp.connect(g); g.connect(sfxBus); n.start(t);
  // hai nốt đi xuống
  note(sfxBus, 76, t + 0.03, 0.12, { type: 'triangle', vol: 0.12, attack: 0.003, release: 0.15 });
  note(sfxBus, 69, t + 0.12, 0.2, { type: 'triangle', vol: 0.12, attack: 0.003, release: 0.25 });
}

// Tiếng càu nhàu "hừm!" tổng hợp (dùng cả khi máy không có giọng đọc tiếng Việt)
function grumble(male) {
  const t = ctx.currentTime;
  const base = male ? 46 : 57;
  for (let k = 0; k < 2; k++) {
    const t0 = t + k * 0.28;
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(freq(base + 4), t0);
    o.frequency.exponentialRampToValueAtTime(freq(base - 3), t0 + 0.24);
    f.type = 'bandpass'; f.frequency.value = male ? 700 : 1100; f.Q.value = 3;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
    o.connect(f); f.connect(g); g.connect(sfxBus); o.start(t0); o.stop(t0 + 0.3);
  }
}

const COMPLAINTS = {
  rich: ['Thật không thể chấp nhận được!', 'Phục vụ kiểu gì thế này, tôi sẽ không quay lại!', 'Tôi đã chờ quá đủ rồi!'],
  normal: ['Chờ lâu quá rồi đấy!', 'Quán gì mà chậm thế không biết!', 'Thôi, tôi đi quán khác!', 'Bực cả mình, chẳng thấy món đâu!'],
  student: ['Ôi trời, đói muốn xỉu rồi!', 'Chán quá, đi ăn mì gói còn hơn!', 'Lâu quá, em đi đây!'],
};
let viVoice = null;
function pickVoice() {
  if (!window.speechSynthesis) return null;
  const vs = speechSynthesis.getVoices();
  return vs.find((v) => /^vi/i.test(v.lang)) || null;
}
if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => { viVoice = pickVoice(); };

export function sfxAngry(profile = {}) {
  if (!ok()) return;
  const male = profile.gender !== 'f';
  grumble(male);
  const lines = COMPLAINTS[profile.wealth] || COMPLAINTS.normal;
  const text = lines[Math.floor(Math.random() * lines.length)];
  viVoice = viVoice || pickVoice();
  if (viVoice) {
    const u = new SpeechSynthesisUtterance(text);
    u.voice = viVoice; u.lang = viVoice.lang;
    u.pitch = male ? 0.7 : 1.3; u.rate = 1.15; u.volume = 0.9;
    setTimeout(() => { if (!muted) { speechSynthesis.cancel(); speechSynthesis.speak(u); } }, 350);
  }
  return text;
}

// ===== Tự phát âm thanh khi tiền thay đổi =====
// game.money được bọc getter/setter: tăng → tiếng nhận tiền, giảm → tiếng trừ tiền.
let _money = game.money;
let lastCoin = 0;
Object.defineProperty(game, 'money', {
  get: () => _money,
  set: (v) => {
    const d = v - _money;
    _money = v;
    if (!d || !game.started || !ctx) return;
    const now = performance.now();
    if (d > 0) { if (now - lastCoin > 60) { lastCoin = now; sfxCoin(d); } }
    else sfxSpend();
  },
  enumerable: true, configurable: true,
});

game.on('customerAngry', (c) => sfxAngry(c.profile));
