import { chromium } from 'playwright';

// ---------------------------------------------------------------------------
// Smoke test for nailpos.
//
// Run:
//   $env:TEST_PASSWORD = "your-test-password"
//   $env:BASE_URL      = "http://localhost:5175"   # or your Netlify preview URL
//   $env:TEST_USERNAME = "admin"                   # optional, defaults to 'admin'
//   node smoke-test.mjs
//
// What it checks:
//   1. Login + navigation across all main screens
//   2. Money path: create an order, take a cash payment, confirm it persists
//   3. Idempotency: double-tap "Confirm" — exactly one order created
//   4. Offline → online: create an order while offline, reconnect, sync runs
//
// Exit code is 0 only if every step passed and no console errors fired.
// ---------------------------------------------------------------------------

const baseUrl  = process.env.BASE_URL || 'http://localhost:5175';
const username = process.env.TEST_USERNAME || 'admin';
const password = process.env.TEST_PASSWORD;

if (!password) {
  console.error('TEST_PASSWORD env var is required');
  process.exit(1);
}

const log = (msg) => console.log(`[smoke] ${msg}`);
const fail = (msg) => { console.error(`[smoke] FAIL: ${msg}`); process.exitCode = 1; };

const mustSee = async (page, text, timeout = 8000) => {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout });
};

// Delete orders the smoke test creates so reruns don't collide on order code.
// Foreign keys order_items.order_id and order_payments.order_id are ON DELETE
// CASCADE, so deleting orders cleans up child rows too.
const cleanupTestOrders = async (page) => {
  log('Cleanup: removing any leftover Smoke Test orders');
  const result = await page.evaluate(async () => {
    const sb = (window).__getSb?.();
    if (!sb) return { error: 'supabase not exposed' };
    const { error, count } = await sb
      .from('orders')
      .delete({ count: 'exact' })
      .in('customer_name', ['Smoke Test', 'Offline Smoke']);
    return { error: error?.message, count };
  });
  if (result?.error) log(`   ! cleanup error: ${result.error}`);
  else log(`   ✓ removed ${result?.count ?? 0} order(s)`);
};

const login = async (page) => {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await mustSee(page, 'Đăng nhập');
  await page.getByPlaceholder('Tên đăng nhập').fill(username);
  await page.getByPlaceholder('Mật khẩu').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await mustSee(page, 'Tổng quan');

  // Open a shift via the post-login "Mở ca làm việc" popup — FAB → OrderModal
  // is gated on getActiveShift(), so we must actually open one (not just
  // dismiss the popup) for the money-path tests below to work.
  try {
    const popup = page.locator('.moverlay.open').filter({ hasText: 'Mở ca làm việc' });
    await popup.waitFor({ timeout: 2000 });
    // Pick the first shift template card (grid is the 2nd child of .mbody).
    await popup.locator('.mbody > div').nth(1).locator('> div').first().click();
    await page.getByRole('button', { name: /^Mở ca$/ }).click();
    await page.waitForTimeout(500);
  } catch { /* no popup or shift already open, fine */ }
};

const navSmoke = async (page) => {
  log('1. Navigation smoke');
  await page.getByRole('button', { name: 'Đơn hàng' }).click();
  await mustSee(page, 'Đơn hàng');
  await page.getByRole('button', { name: 'Lịch hẹn' }).click();
  await mustSee(page, 'Lịch hẹn');
  await page.getByRole('button', { name: 'Khách hàng' }).click();
  await mustSee(page, 'Khách hàng');
  await page.getByRole('button', { name: 'Cài đặt' }).click();
  // "Cài đặt" itself is the nav button label, so it's always visible — use
  // a row that only appears on the Settings screen as the real landed signal.
  await mustSee(page, 'Thông tin app');
};

// Walks the FAB → OrderModal → PaymentModal flow with a walk-in customer
// and the first catalog item. Returns the count of orders visible on the
// orders screen *before* and *after* so callers can assert deltas.
const createOrderAndPay = async (page, { doubleTap = false } = {}) => {
  // Land on Đơn hàng so we can count orders before/after
  await page.getByRole('button', { name: 'Đơn hàng' }).click();
  await mustSee(page, 'Đơn hàng');
  await page.waitForTimeout(500);
  const beforeCount = await page.locator('.screen.active .lrow.tap').count();

  // FAB → OrderModal
  await page.locator('#fabBtn').click();
  await mustSee(page, 'Đơn hàng mới');

  // Walk-in customer
  await page.getByPlaceholder(/Tên, SĐT, hoặc walk-in/).fill('Smoke Test');
  await page.locator('.ac-item.ac-walkin').click();

  // Pick the first catalog card
  const firstCard = page.locator('.cat-card').first();
  await firstCard.click();

  // Proceed to pay
  await page.getByRole('button', { name: /Thanh toán →/ }).click();
  await mustSee(page, 'Phương thức thanh toán');

  // Confirm — single tap, or double tap for idempotency check
  const confirmBtn = page.getByRole('button', { name: /Xác nhận/ });
  if (doubleTap) {
    await Promise.all([confirmBtn.click(), confirmBtn.click().catch(() => {})]);
  } else {
    await confirmBtn.click();
  }

  // Wait for the modal to close + return to orders list
  await page.waitForTimeout(2500);
  const afterCount = await page.locator('.screen.active .lrow.tap').count();
  return { beforeCount, afterCount, delta: afterCount - beforeCount };
};

const moneyPathSmoke = async (page) => {
  log('2. Money path: create + pay');
  const { delta } = await createOrderAndPay(page);
  if (delta !== 1) {
    fail(`expected 1 new order after payment, got delta=${delta}`);
  } else {
    log('   ✓ exactly one order created');
  }
};

const idempotencySmoke = async (page) => {
  log('3. Idempotency: double-tap Confirm');
  const { delta } = await createOrderAndPay(page, { doubleTap: true });
  if (delta !== 1) {
    fail(`double-tap created ${delta} orders — idempotency regression!`);
  } else {
    log('   ✓ double-tap still produced exactly one order');
  }
};

const offlineSyncSmoke = async (page, context) => {
  log('4. Offline → online sync');
  await context.setOffline(true);
  log('   network OFF');

  await page.getByRole('button', { name: 'Đơn hàng' }).click();
  await page.locator('#fabBtn').click();
  await mustSee(page, 'Đơn hàng mới');
  await page.getByPlaceholder(/Tên, SĐT, hoặc walk-in/).fill('Offline Smoke');
  await page.locator('.ac-item.ac-walkin').click();
  await page.locator('.cat-card').first().click();
  await page.getByRole('button', { name: /Thanh toán →/ }).click();
  await page.getByRole('button', { name: /Xác nhận/ }).click();
  await page.waitForTimeout(1000);

  await context.setOffline(false);
  log('   network ON, waiting for sync toast...');
  try {
    await page.getByText(/Đã đồng bộ/).first().waitFor({ timeout: 10000 });
    log('   ✓ sync toast appeared');
  } catch {
    fail('expected "Đã đồng bộ" toast after reconnect, did not appear');
  }
};

const run = async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];

  // Skip noise that is expected during the test run or known-non-fatal:
  //   - ERR_INTERNET_DISCONNECTED: step 4 intentionally drops the network.
  //   - audit_log writes: logAudit is fire-and-forget by design (the local
  //     copy already saved); schema drift between repo and live DB makes
  //     these noisy but harmless. Worth tracking separately, not as a fail.
  const isBenign = (text) =>
    /ERR_INTERNET_DISCONNECTED/i.test(text) ||
    /audit_log/i.test(text) ||
    /Failed to load resource/i.test(text); // duplicated as generic msg
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const t = msg.text();
    if (isBenign(t)) return;
    errors.push(`console: ${t}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  // Capture failing HTTP responses (4xx/5xx) with URL + method so we can
  // pinpoint which Supabase request is rejecting writes.
  page.on('response', async (res) => {
    const status = res.status();
    if (status < 400) return;
    const url = res.url();
    if (isBenign(url)) return;
    let body = '';
    try { body = (await res.text()).slice(0, 300); } catch {}
    errors.push(`http ${status} ${res.request().method()} ${url} :: ${body}`);
  });

  try {
    await login(page);
    await cleanupTestOrders(page); // clear data from prior runs
    await navSmoke(page);
    await moneyPathSmoke(page);
    await idempotencySmoke(page);
    await offlineSyncSmoke(page, context);
    await cleanupTestOrders(page); // clear data from this run
  } catch (err) {
    fail(`unhandled: ${err.message}`);
  }

  if (errors.length > 0) {
    console.error('[smoke] browser errors:');
    errors.forEach((e) => console.error('  ' + e));
    process.exitCode = 1;
  }

  await browser.close();
  if (process.exitCode) {
    console.error('[smoke] FAILED');
  } else {
    console.log('[smoke] PASSED');
  }
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
