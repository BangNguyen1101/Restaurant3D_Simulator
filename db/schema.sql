-- =========================================================
-- Các bảng lưu tiến trình game Nhà Hàng 3D (PostgreSQL)
-- Chạy lại nhiều lần vẫn an toàn (IF NOT EXISTS / OR REPLACE).
-- Server Node tự chạy file này khi khởi động.
-- Chạy tay:  psql "$DATABASE_URL" -f db/schema.sql
-- =========================================================

-- Mỗi ô lưu (save slot) = 1 người chơi / 1 ván
CREATE TABLE IF NOT EXISTS saves (
    save_id       SERIAL       PRIMARY KEY,
    slot_name     VARCHAR(50)  NOT NULL UNIQUE,
    day           INT          NOT NULL DEFAULT 1,     -- ngày sẽ chơi khi tải lại
    money         INT          NOT NULL DEFAULT 150,
    total_served  INT          NOT NULL DEFAULT 0,
    total_lost    INT          NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Tồn kho nguyên liệu
CREATE TABLE IF NOT EXISTS save_inventory (
    save_id     INT          NOT NULL REFERENCES saves(save_id) ON DELETE CASCADE,
    ingredient  VARCHAR(20)  NOT NULL,   -- bun / meat / lettuce / tomato
    quantity    INT          NOT NULL CHECK (quantity >= 0),
    PRIMARY KEY (save_id, ingredient)
);

-- Đồ đạc đã đặt: bàn ghế + thiết bị bếp (vị trí trên lưới)
-- item_type = 'wall_removed' đánh dấu ô tường trong nhà người chơi đã phá
CREATE TABLE IF NOT EXISTS save_furniture (
    furniture_id  SERIAL       PRIMARY KEY,
    save_id       INT          NOT NULL REFERENCES saves(save_id) ON DELETE CASCADE,
    item_type     VARCHAR(20)  NOT NULL,
    x             INT          NOT NULL,
    z             INT          NOT NULL,
    rotation      SMALLINT     NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_save_furniture_save ON save_furniture (save_id);

-- Nhân viên đã thuê
CREATE TABLE IF NOT EXISTS save_staff (
    staff_id  SERIAL       PRIMARY KEY,
    save_id   INT          NOT NULL REFERENCES saves(save_id) ON DELETE CASCADE,
    role      VARCHAR(10)  NOT NULL CHECK (role IN ('chef', 'waiter'))
);
CREATE INDEX IF NOT EXISTS ix_save_staff_save ON save_staff (save_id);

-- Các khu đã mở rộng
CREATE TABLE IF NOT EXISTS save_expansions (
    save_id       INT NOT NULL REFERENCES saves(save_id) ON DELETE CASCADE,
    expansion_no  INT NOT NULL,
    PRIMARY KEY (save_id, expansion_no)
);

-- Báo cáo cuối mỗi ngày (lịch sử kinh doanh)
CREATE TABLE IF NOT EXISTS day_reports (
    report_id   SERIAL       PRIMARY KEY,
    save_id     INT          NOT NULL REFERENCES saves(save_id) ON DELETE CASCADE,
    day         INT          NOT NULL,
    served      INT          NOT NULL,
    lost        INT          NOT NULL,
    revenue     INT          NOT NULL,
    tips        INT          NOT NULL,
    spent       INT          NOT NULL,
    wages       INT          NOT NULL,
    profit      INT          NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_day_reports UNIQUE (save_id, day)
);

-- View tổng quan từng ô lưu (dùng cho menu)
CREATE OR REPLACE VIEW vw_save_overview AS
SELECT s.save_id, s.slot_name, s.day, s.money, s.total_served, s.total_lost, s.updated_at,
       (SELECT COUNT(*) FROM save_furniture f WHERE f.save_id = s.save_id AND f.item_type = 'table')::int AS tables,
       (SELECT COUNT(*) FROM save_staff st WHERE st.save_id = s.save_id)::int AS staff,
       (SELECT COALESCE(SUM(r.profit), 0) FROM day_reports r WHERE r.save_id = s.save_id)::int AS total_profit
FROM saves s;
