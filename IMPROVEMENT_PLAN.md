# Plan cải tiến nailpos lấy cảm hứng từ CUKCUK

3 ưu tiên — sắp theo thứ tự nên làm.

---

## 1. Quỹ tiền + đối soát ca (Cashbox reconciliation)

### Vấn đề hiện tại
- `closeShift` trong [src/hooks/useShift.ts](src/hooks/useShift.ts) có nhận `actualCash` nhưng **không so với expected** → owner không biết chênh lệch.
- `openShift` không nhận `opening_float` (tiền sẵn trong tủ đầu ca).
- Không phân biệt được doanh thu tiền mặt vs chuyển khoản trong báo cáo ca.

### Schema (localStorage — vì shifts là client-side)

Mở rộng shift object trong `useShift.ts`:

```ts
{
  // existing fields...
  opening_float: number,        // tiền tủ đầu ca
  closing_amount: number,       // tiền tủ cuối ca (= actualCash hiện tại)
  expected_cash: number,        // float + cash_sales - cash_payouts
  variance: number,             // closing - expected
  cash_sales: number,           // tổng đơn paid bằng tiền mặt
  card_sales: number,           // tổng paid không phải tiền mặt
  cash_payouts: number,         // tổng phiếu chi tiền mặt trong ca (xem mục mở rộng cuối)
}
```

### Thay đổi code

- [src/hooks/useShift.ts:77](src/hooks/useShift.ts:77) `openShift(...)` → thêm tham số `openingFloat: number`, lưu vào shift.
- [src/hooks/useShift.ts:102](src/hooks/useShift.ts:102) `closeShift(...)` → tính:
  ```ts
  const cashOrders = shiftOrders.filter(o => o.payment_method === 'cash');
  const cash_sales = cashOrders.reduce(...);
  const card_sales = revenue - cash_sales;
  const expected_cash = shift.opening_float + cash_sales; // payouts: phase 2
  const variance = actualCash - expected_cash;
  ```
- Modal mở ca: thêm input "Tiền tủ đầu ca" (default 0, có thể set giá trị mặc định trong Settings).
- Modal đóng ca: hiển thị bảng:
  ```
  Tiền đầu ca:        500,000
  Doanh thu tiền mặt: 2,340,000
  → Phải có:          2,840,000
  Thực đếm:           [input]
  Chênh lệch:         +12,000  ← màu đỏ nếu |variance| > 50k
  ```
- Dashboard widget "Ca hiện tại" — bổ sung dòng "Chênh lệch ca trước: ±X".

### Files
- `src/hooks/useShift.ts` (sửa)
- `src/components/settings/OtherPanels.tsx` — ShiftPanel (tìm modal open/close ca, thêm field)
- `src/components/dashboard/DashboardScreen.tsx` — bổ sung dòng variance

### Verify
- Mở ca với float 500k → tạo 3 đơn cash 1tr, 1 đơn card 500k → đóng ca với actualCash = 3,500,000 → expect variance = 0.
- Mở ca → tạo đơn cash → đóng ca với số thiếu 50k → expect variance = -50,000, alert hiển thị.

**Effort**: ~1 ngày. Schema thuần localStorage, không cần migration.

---

## 2. Lý do hủy đơn — master data + report

### Vấn đề hiện tại
- [src/components/modals/OrderDetailModal.tsx:74-79](src/components/modals/OrderDetailModal.tsx:74) — `cancelReason` là free text, ghép vào `notes`.
- Không thể group / count theo lý do.

### Schema

**Migration mới `008_cancel_reasons.sql`**:

```sql
create table public.cancel_reasons (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.cancel_reasons enable row level security;
create policy cancel_reasons_read on public.cancel_reasons
  for select using (auth.role() = 'authenticated');
create policy cancel_reasons_write on public.cancel_reasons
  for all using (auth.role() = 'authenticated');

alter table public.orders
  add column if not exists cancel_reason_id uuid references public.cancel_reasons(id),
  add column if not exists cancel_note text;

-- seed gợi ý
insert into public.cancel_reasons (label, sort_order) values
  ('Khách đổi ý', 10),
  ('Nhân viên bận', 20),
  ('Hết vật tư', 30),
  ('Sai dịch vụ', 40),
  ('Khiếu nại chất lượng', 50),
  ('Khác', 99);
```

### Code

- Settings panel mới "Lý do hủy đơn" trong [src/components/settings/OtherPanels.tsx](src/components/settings/OtherPanels.tsx) — CRUD đơn giản giống ShiftTemplatePanel (label + active toggle + drag-sort).
- [src/components/modals/OrderDetailModal.tsx:88](src/components/modals/OrderDetailModal.tsx:88) cancel confirm UI:
  - Đổi `<input>` free text thành `<select>` lý do (load từ `cache.cancel_reasons`).
  - Thêm textarea "Ghi chú thêm" optional.
  - Submit: `dbUpdate('orders', id, { status: 'cancelled', cancel_reason_id, cancel_note })` — bỏ ghép vào `notes`.
- Cập nhật `useCache` để load bảng mới.
- Report: thêm sub-tab "Tỷ lệ hủy" trong [src/components/reports/](src/components/reports/) — group by `cancel_reason_id`, hiển thị count + tổng giá trị bị hủy.

### Verify
- Tạo lý do mới trong Settings → quay lại đơn → hủy → chọn lý do mới → kiểm tra cancel_reason_id được set đúng.
- Report "Tỷ lệ hủy" hiển thị count đúng theo lý do.
- Test offline: hủy đơn khi offline → reason vẫn lưu qua write-queue.

**Effort**: ~1 ngày. Cần migration + RLS policy. Tuân thủ AGENTS.md "every Supabase table needs RLS".

---

## 3. Dashboard — widget công suất + per-card filter

### Vấn đề hiện tại
- [src/components/dashboard/DashboardScreen.tsx](src/components/dashboard/DashboardScreen.tsx) có 1 filter toàn cục (today/week/month) cho tất cả card.
- Không có view real-time "đang phục vụ bao nhiêu khách".

### Phần A — Per-card time filter

Refactor mỗi KPI card thành component nhận `period` riêng:

```tsx
function RevenueCard() {
  const [period, setPeriod] = useState<'today'|'week'|'month'>('today');
  // ...query orders by period
  return <Card title="Doanh thu" period={period} onPeriodChange={setPeriod}>...</Card>;
}
```

Persist mỗi card's period trong localStorage key `np_dashboard_periods` (object map) — owner mở app sáng vẫn thấy view yêu thích.

### Phần B — Widget "Đang phục vụ"

Card mới (không có period vì là real-time):

```
┌─ ĐANG HOẠT ĐỘNG ────────────────────┐
│ Đang phục vụ:  6 khách              │
│ Đã xong hôm nay: 12                 │
│ Chờ thanh toán: 2  (450,000đ)       │
│ Công suất ghế: 6/8  (75%)           │
└─────────────────────────────────────┘
```

Data:
- "Đang phục vụ" = appointments where `status='in_progress'` HOẶC orders where `status='pending'` AND không có `paid_at`.
- "Đã xong" = orders.status='paid' của hôm nay.
- "Công suất ghế" = cần concept `chairs` mới. **Phase 1**: hardcode total chairs từ Settings (app_settings.total_chairs). **Phase 2**: full chair management.

### Files
- `src/components/dashboard/DashboardScreen.tsx` — refactor
- Tạo `src/components/dashboard/cards/` với:
  - `RevenueCard.tsx`
  - `OrdersCard.tsx`
  - `LiveActivityCard.tsx` (mới)
- `src/components/settings/OtherPanels.tsx` — thêm field `total_chairs` vào AppInfoPanel.

### Verify
- Set period riêng từng card → reload trang → từng card giữ period đã chọn.
- Tạo đơn pending → "Chờ thanh toán" tăng 1; thanh toán → "Đã xong" tăng 1, "Chờ thanh toán" giảm.
- Set total_chairs = 8, có 6 đơn pending → công suất 75%.

**Effort**: ~1.5 ngày.

---

## Thứ tự đề xuất

1. **Tuần 1**: làm #2 (Lý do hủy) — small, validate quy trình migration + RLS.
2. **Tuần 1-2**: làm #1 (Quỹ tiền) — value cao nhất với owner, pure localStorage nên không rủi ro DB.
3. **Tuần 2-3**: làm #3 (Dashboard) — refactor có scope, làm sau cùng để không block 2 cái trên.

## Không nên làm (theo CUKCUK nhưng không hợp salon)
- Sidebar 23 mục phẳng — giữ bottom-nav 5 tab.
- Mega-menu — không hợp PWA mobile.
- Tách "Hóa đơn mua/bán" thành các mục riêng — đó là kế toán mindset.
- HĐĐT (e-invoice) — chỉ làm khi compliance yêu cầu.
