// Nhãn HTML gắn vào vị trí 3D: thanh thời gian, bong bóng gọi món, chữ bay "+$".
import * as THREE from 'three';
import { game } from './state.js';

const layer = () => document.getElementById('labels');
const v = new THREE.Vector3();

export class Label {
  constructor(cls = '') {
    this.el = document.createElement('div');
    this.el.className = 'wlabel ' + cls;
    this.el.style.display = 'none';
    layer().appendChild(this.el);
    this.html = null;
  }
  set(html) {
    if (html !== this.html) { this.el.innerHTML = html; this.html = html; }
  }
  // Hiển thị tại vị trí 3D (ẩn nếu ở sau camera hoặc quá xa)
  show(pos, maxDist = 18) {
    const cam = game.camera;
    if (!this.html || cam.position.distanceTo(pos) > maxDist) return this.hide();
    v.copy(pos).project(cam);
    if (v.z > 1 || v.z < -1) return this.hide();
    this.el.style.display = 'block';
    this.el.style.transform = `translate(-50%,-100%) translate(${(v.x + 1) / 2 * innerWidth}px,${(1 - v.y) / 2 * innerHeight}px)`;
  }
  hide() { this.el.style.display = 'none'; }
  destroy() { this.el.remove(); }
}

export function bar(ratio, color) {
  const r = Math.max(0, Math.min(1, ratio));
  return `<div class="bar"><i style="width:${(r * 100).toFixed(0)}%;background:${color}"></i></div>`;
}

const floaters = [];
export function floatText(text, pos, color = '#7CFC7C') {
  const l = new Label('floater');
  l.set(`<span style="color:${color}">${text}</span>`);
  floaters.push({ l, pos: pos.clone(), t: 0 });
}
export function updateFloaters(dt) {
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.t += dt; f.pos.y += dt * 0.6;
    f.l.el.style.opacity = String(1 - f.t / 1.8);
    f.l.show(f.pos, 40);
    if (f.t > 1.8) { f.l.destroy(); floaters.splice(i, 1); }
  }
}
