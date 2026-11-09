/* =========================================================
   Các bảng lưu tiến trình game Nhà Hàng 3D
   Chạy lại nhiều lần cũng an toàn (IF NOT EXISTS).
   Server Node tự chạy file này trên database đã kết nối khi khởi động.
   Không có lệnh CREATE DATABASE / USE để chạy được cả trên Azure SQL.
   Chạy tay trên máy:  sqlcmd -S localhost -E -d NhaHang3D -i db/schema.sql
   ========================================================= */

-- Mỗi ô lưu (save slot) = 1 người chơi / 1 ván
IF OBJECT_ID(N'dbo.Saves', N'U') IS NULL
CREATE TABLE dbo.Saves (
    SaveId       INT IDENTITY(1,1) PRIMARY KEY,
    SlotName     NVARCHAR(50)  NOT NULL UNIQUE,
    Day          INT           NOT NULL DEFAULT 1,      -- ngày sẽ chơi khi tải lại
    Money        INT           NOT NULL DEFAULT 150,
    TotalServed  INT           NOT NULL DEFAULT 0,
    TotalLost    INT           NOT NULL DEFAULT 0,
    CreatedAt    DATETIME2(0)  NOT NULL DEFAULT SYSDATETIME(),
    UpdatedAt    DATETIME2(0)  NOT NULL DEFAULT SYSDATETIME()
);
GO

-- Tồn kho nguyên liệu
IF OBJECT_ID(N'dbo.SaveInventory', N'U') IS NULL
CREATE TABLE dbo.SaveInventory (
    SaveId      INT          NOT NULL REFERENCES dbo.Saves(SaveId) ON DELETE CASCADE,
    Ingredient  VARCHAR(20)  NOT NULL,   -- bun / meat / lettuce / tomato
    Quantity    INT          NOT NULL CHECK (Quantity >= 0),
    PRIMARY KEY (SaveId, Ingredient)
);
GO

-- Đồ đạc đã đặt: bàn ghế + thiết bị bếp (vị trí trên lưới)
IF OBJECT_ID(N'dbo.SaveFurniture', N'U') IS NULL
CREATE TABLE dbo.SaveFurniture (
    FurnitureId INT IDENTITY(1,1) PRIMARY KEY,
    SaveId      INT          NOT NULL REFERENCES dbo.Saves(SaveId) ON DELETE CASCADE,
    ItemType    VARCHAR(20)  NOT NULL,   -- table / stove / board / counter / crate_meat ...
    X           INT          NOT NULL,
    Z           INT          NOT NULL,
    Rotation    TINYINT      NOT NULL DEFAULT 0
);
GO

-- Nhân viên đã thuê
IF OBJECT_ID(N'dbo.SaveStaff', N'U') IS NULL
CREATE TABLE dbo.SaveStaff (
    StaffId  INT IDENTITY(1,1) PRIMARY KEY,
    SaveId   INT          NOT NULL REFERENCES dbo.Saves(SaveId) ON DELETE CASCADE,
    Role     VARCHAR(10)  NOT NULL CHECK (Role IN ('chef', 'waiter'))
);
GO

-- Các khu đã mở rộng
IF OBJECT_ID(N'dbo.SaveExpansions', N'U') IS NULL
CREATE TABLE dbo.SaveExpansions (
    SaveId       INT NOT NULL REFERENCES dbo.Saves(SaveId) ON DELETE CASCADE,
    ExpansionNo  INT NOT NULL,
    PRIMARY KEY (SaveId, ExpansionNo)
);
GO

-- Báo cáo cuối mỗi ngày (lịch sử kinh doanh)
IF OBJECT_ID(N'dbo.DayReports', N'U') IS NULL
CREATE TABLE dbo.DayReports (
    ReportId   INT IDENTITY(1,1) PRIMARY KEY,
    SaveId     INT NOT NULL REFERENCES dbo.Saves(SaveId) ON DELETE CASCADE,
    Day        INT NOT NULL,
    Served     INT NOT NULL,
    Lost       INT NOT NULL,
    Revenue    INT NOT NULL,
    Tips       INT NOT NULL,
    Spent      INT NOT NULL,
    Wages      INT NOT NULL,
    Profit     INT NOT NULL,
    CreatedAt  DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT UQ_DayReports UNIQUE (SaveId, Day)
);
GO

-- View tiện xem nhanh trong SSMS
CREATE OR ALTER VIEW dbo.vw_SaveOverview AS
SELECT s.SaveId, s.SlotName, s.Day, s.Money, s.TotalServed, s.TotalLost, s.UpdatedAt,
       (SELECT COUNT(*) FROM dbo.SaveFurniture f WHERE f.SaveId = s.SaveId AND f.ItemType = 'table') AS Tables,
       (SELECT COUNT(*) FROM dbo.SaveStaff st WHERE st.SaveId = s.SaveId) AS Staff,
       (SELECT ISNULL(SUM(r.Profit), 0) FROM dbo.DayReports r WHERE r.SaveId = s.SaveId) AS TotalProfit
FROM dbo.Saves s;
GO
