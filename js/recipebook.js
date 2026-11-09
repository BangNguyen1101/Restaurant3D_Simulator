// Bảng công thức: cách chế biến từng bước của từng món (bấm C để mở/đóng).
import { RECIPES, ING } from './items.js';
import { COOK_TIME, BURN_TIME, CHOP_TIME } from './cooking.js';
import { unitCost } from './inventory.js';

const ICON = { bun: '🍞', meat: '🥩', lettuce: '🥬', tomato: '🍅' };

// Bước chế biến cho từng nguyên liệu
const PREP = {
  bun: () => 'Lấy <b>Bánh mì</b> ở thùng bánh mì → ghép thẳng vào đĩa (không cần chế biến).',
  meat: () => `Lấy <b>Thịt sống</b> ở tủ lạnh → đặt lên <b>Bếp</b>, chờ <b>${COOK_TIME} giây</b> đến khi chín → lấy ra ngay (để thêm quá <b>${BURN_TIME} giây</b> sẽ <span class="bad">cháy</span>, phải vứt bỏ) → ghép vào đĩa.`,
  lettuce: () => `Lấy <b>Rau</b> ở thùng rau → đặt lên <b>Thớt</b> → bấm <kbd>F</kbd> cắt <b>${CHOP_TIME} giây</b> → ghép vào đĩa.`,
  tomato: () => `Lấy <b>Cà chua</b> ở thùng cà chua → đặt lên <b>Thớt</b> → bấm <kbd>F</kbd> cắt <b>${CHOP_TIME} giây</b> → ghép vào đĩa.`,
};
// Thứ tự nấu hợp lý: việc lâu (nướng thịt) làm trước, trong lúc chờ thì cắt rau
const ORDER = ['meat', 'lettuce', 'tomato', 'bun'];

export function recipeBookHTML() {
  const cards = RECIPES.map((r) => {
    const parts = ORDER.filter((p) => r.parts.includes(p));
    const cost = r.parts.reduce((s, p) => s + unitCost(p), 0);
    const steps = [
      'Lấy <b>đĩa sạch</b> ở chồng đĩa → đặt lên <b>Quầy ra món</b>.',
      ...parts.map((p) => PREP[p]()),
      `Khi đĩa đủ món (quầy hiện 🛎️ <b>${r.name}</b>) → bưng tới đúng bàn khách đã gọi.`,
    ];
    if (r.parts.includes('meat') && r.parts.length > 2) steps.splice(2, 0, '<i>Mẹo: đặt thịt lên bếp trước, trong lúc chờ chín thì đi cắt rau/cà chua.</i>');
    return `<div class="rcard">
      <div class="rhead"><span class="ricon">${r.icon}</span><div><div class="rname">${r.name}</div>
        <div class="rparts">${r.parts.map((p) => `${ICON[p]} ${ING[p].name}`).join(' + ')}</div></div>
        <div class="rprice">$${r.price}<small>Vốn ~$${cost.toFixed(1)} · Lãi ~$${(r.price - cost).toFixed(1)}</small></div></div>
      <ol>${steps.map((s) => `<li>${s}</li>`).join('')}</ol></div>`;
  }).join('');
  return `<div class="rbook"><h2>📖 Sổ công thức <small>bấm C để đóng</small></h2><div class="rgrid">${cards}</div>
    <div class="rfoot">Sau khi khách ăn xong: dọn <b>đĩa bẩn</b> trên bàn → mang tới <b>Bồn rửa</b>. Thịt cháy / món hỏng → <b>Thùng rác</b>.</div></div>`;
}
