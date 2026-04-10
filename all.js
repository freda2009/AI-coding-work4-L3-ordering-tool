/**
 * ==================================================
 * 1. 環境變數設定
 * 以下常數為專案所需變數，本專案僅在前端執行，無後端與 secret key。
 * 請開發者填寫以下參數以執行程式：
 * ==================================================
 */
const API_KEY = 'AIzaSyB8qMe5kVJa1QUzwJc9X2FSt7VV8K2tsvQ';
const CLIENT_ID = '208816868977-ah6v522m25kilkj7crlvsbo8jl8hv065.apps.googleusercontent.com';
const SPREADSHEET_ID = '1thIeMZqfY2gvoCbKw3JnRzmTQ6Mdz4bfehEapK2_aaI';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email';

/**
 * ==================================================
 * 2. 全域狀態變數
 * ==================================================
 */
let userEmail = '';
let userRole = ''; // '管理員', '一般成員', 或 '' (未授權)
let accessToken = '';

// 快取資料
let sheetUsers = [];
let sheetMenu = [];
let sheetTodayConfig = [];
let sheetOrders = [];

// DOM 元素快取
const dom = {
  loginContainer: document.getElementById('login-container'),
  appContainer: document.getElementById('app-container'),
  authBtn: document.getElementById('auth-btn'),
  userInfo: document.getElementById('user-info'),
  userNameDisplay: document.getElementById('user-name-display'),
  userRoleBadge: document.getElementById('user-role-badge'),
  alertMessage: document.getElementById('alert-message'),

  // Tabs
  tabBtns: document.querySelectorAll('.tab-btn'),
  tabPanes: document.querySelectorAll('.tab-pane'),
  adminTabBtn: document.getElementById('admin-tab-btn'),

  // 管理區
  adminCheckboxes: document.getElementById('admin-restaurant-checkboxes'),
  saveTodayConfigBtn: document.getElementById('save-today-config-btn'),
  clearOrdersBtn: document.getElementById('clear-orders-btn'),

  // 點餐區
  todayRestaurantsDisplay: document.getElementById('today-restaurants-display'),
  menuCardsContainer: document.getElementById('menu-cards-container'),

  // 訂單區
  ordersListContainer: document.getElementById('orders-list-container'),
  copyOrdersBtn: document.getElementById('copy-orders-btn')
};

/**
 * ==================================================
 * 3. 認證邏輯：使用 Google Identity Services
 * ==================================================
 */
let tokenClient;

window.onload = function () {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: (tokenResponse) => {
      if (tokenResponse && tokenResponse.access_token) {
        accessToken = tokenResponse.access_token;
        handleLoginSuccess();
      }
    },
  });

  dom.authBtn.addEventListener('click', () => {
    tokenClient.requestAccessToken();
  });

  dom.saveTodayConfigBtn.addEventListener('click', handleSaveTodayConfig);
  dom.copyOrdersBtn.addEventListener('click', handleCopyOrders);
  dom.clearOrdersBtn.addEventListener('click', handleClearOrders);

  // 初始化分頁切換事件
  initTabs();
};

async function handleLoginSuccess() {
  dom.authBtn.textContent = '登入中...';
  dom.authBtn.disabled = true;

  try {
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const userInfo = await userInfoRes.json();
    userEmail = userInfo.email;

    await fetchAllData();
    checkUserPermission();

  } catch (error) {
    console.error('Login error:', error);
    showAlert('出錯了，可能是您的憑證尚未設定完整，請檢查 Console。', 'error');
  } finally {
    dom.authBtn.textContent = 'Sign in with Google';
    dom.authBtn.disabled = false;
  }
}

/**
 * ==================================================
 * 4. 試算表操作與權限判斷
 * ==================================================
 */
async function fetchSheetData(range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?key=${API_KEY}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await res.json();
  return data.values ? data.values.slice(1) : [];
}

async function fetchAllData() {
  sheetUsers = await fetchSheetData('Users!A:C');
  sheetMenu = await fetchSheetData('Menu!A:D');
  const rawToday = await fetchSheetData('TodayConfig!A:A');
  sheetTodayConfig = rawToday.map(row => row[0]).filter(Boolean);
  sheetOrders = await fetchSheetData('Orders!A:F');
}

function checkUserPermission() {
  const user = sheetUsers.find(row => row[1] === userEmail);

  if (!user) {
    showAlert(`未獲授權：您的信箱 (${userEmail}) 不在系統名單內`, 'error');
    return;
  }

  dom.userNameDisplay.textContent = user[0] || userEmail;
  userRole = user[2] || '一般成員';
  dom.userRoleBadge.textContent = userRole;
  dom.userInfo.classList.remove('hidden');

  dom.loginContainer.classList.add('hidden');
  dom.appContainer.classList.remove('hidden');

  if (userRole === '管理員') {
    document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
    renderAdminCheckboxes();
  } else {
    document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
  }

  // 強制先跳換到點餐區
  switchTab('tab-order');
  renderTodayMenu();
  renderOrdersList();
}

/**
 * ==================================================
 * 5. UI 互動與分頁切換 (Tabs)
 * ==================================================
 */
function initTabs() {
  dom.tabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetId = e.target.getAttribute('data-target');
      switchTab(targetId);
    });
  });
}

function switchTab(targetId) {
  // 移除所有 active 狀態
  dom.tabBtns.forEach(b => b.classList.remove('active'));
  dom.tabPanes.forEach(p => p.classList.remove('active'));

  // 啟用指定的 tab
  const btn = document.querySelector(`.tab-btn[data-target="${targetId}"]`);
  const pane = document.getElementById(targetId);
  if (btn) btn.classList.add('active');
  if (pane) pane.classList.add('active');
}

/**
 * ==================================================
 * 6. 管理員專區邏輯
 * ==================================================
 */
function renderAdminCheckboxes() {
  const restaurants = [...new Set(sheetMenu.map(item => item[0]))];
  dom.adminCheckboxes.innerHTML = '';

  restaurants.forEach(rest => {
    const isChecked = sheetTodayConfig.includes(rest) ? 'checked' : '';
    const html = `
      <label class="checkbox-item">
        <input type="checkbox" value="${rest}" ${isChecked}>
        ${rest}
      </label>
    `;
    dom.adminCheckboxes.insertAdjacentHTML('beforeend', html);
  });
}

async function handleSaveTodayConfig() {
  dom.saveTodayConfigBtn.disabled = true;
  dom.saveTodayConfigBtn.textContent = 'Saving...';

  const checkboxes = dom.adminCheckboxes.querySelectorAll('input[type="checkbox"]:checked');
  const selected = Array.from(checkboxes).map(cb => [cb.value]);
  const bodyValues = [['今日開放餐廳'], ...selected];

  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/TodayConfig!A:A?valueInputOption=USER_ENTERED`;
    await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values: bodyValues })
    });

    await fetchAllData();
    renderTodayMenu();
    showAlert('餐廳設定已更新，現在可至點餐區查看。', 'success');
  } catch (err) {
    console.error(err);
    showAlert('設定失敗', 'error');
  } finally {
    dom.saveTodayConfigBtn.disabled = false;
    dom.saveTodayConfigBtn.textContent = '儲存餐廳設定';
  }
}

async function handleClearOrders() {
  if (!confirm('您確認要清空所有點餐資料嗎？此操作不可逆。')) {
    return;
  }

  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/Orders!A2:F:clear`;
    await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      }
    });

    showAlert('已成功清空所有訂單', 'success');
    await fetchAllData();
    renderOrdersList();

  } catch (err) {
    console.error(err);
    showAlert('清空訂單失敗', 'error');
  }
}

/**
 * ==================================================
 * 7. 點餐專區邏輯
 * ==================================================
 */
function renderTodayMenu() {
  dom.todayRestaurantsDisplay.textContent = sheetTodayConfig.length > 0 ? sheetTodayConfig.join('、') : '目前尚未設定';
  const todayMenuItems = sheetMenu.filter(item => sheetTodayConfig.includes(item[0]));
  dom.menuCardsContainer.innerHTML = '';

  if (todayMenuItems.length === 0) {
    dom.menuCardsContainer.innerHTML = '<p class="text-muted">管理員尚未設定今日菜單，請通知管理員前往設定。</p>';
    return;
  }

  todayMenuItems.forEach((item, index) => {
    const restName = item[0];
    const itemName = item[1];
    const itemPrice = item[2];
    // 單色優雅風卡片設計
    const card = document.createElement('div');
    card.className = 'menu-card';
    card.innerHTML = `
      <div style="flex: 1;">
        <div class="restaurant-label">${restName}</div>
        <h4>${itemName}</h4>
        <div class="price">NT$ ${itemPrice}</div>
      </div>
      <div>
        <input type="text" id="remark-${index}" placeholder="餐點備註，如：微糖/不加蔥">
        <button class="btn btn-outline" style="width: 100%" onclick="handleOrder('${restName}', '${itemName}', '${itemPrice}', 'remark-${index}')">點餐</button>
      </div>
    `;
    dom.menuCardsContainer.appendChild(card);
  });
}

window.handleOrder = async function (restName, itemName, itemPrice, remarkInputId) {
  const remarkStr = document.getElementById(remarkInputId).value || '無';
  const now = new Date();
  const timeStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const newOrder = [timeStr, userEmail, restName, itemName, itemPrice, remarkStr];

  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/Orders!A:F:append?valueInputOption=USER_ENTERED`;
    await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values: [newOrder] })
    });

    document.getElementById(remarkInputId).value = '';
    showAlert(`已新增您的訂單：${itemName}`, 'success');

    await fetchAllData();
    renderOrdersList();

  } catch (err) {
    console.error(err);
    showAlert('點餐失敗，請重試。', 'error');
  }
}

/**
 * ==================================================
 * 8. 訂單確認區邏輯
 * ==================================================
 */
function renderOrdersList() {
  dom.ordersListContainer.innerHTML = '';
  if (sheetOrders.length === 0) {
    dom.ordersListContainer.innerHTML = '<div style="padding:10px; color:var(--color-gray);">目前尚無點餐紀錄。</div>';
    return;
  }

  sheetOrders.forEach(order => {
    const emailPrefix = (order[1] || '').split('@')[0];
    const html = `
      <div class="order-item">
        <div class="order-user">${emailPrefix}</div>
        <div class="order-detail">${order[2]} - ${order[3]} (NT$ ${order[4]})</div>
        <div class="order-remark">備註: ${order[5] || '無'}</div>
      </div>
    `;
    dom.ordersListContainer.insertAdjacentHTML('beforeend', html);
  });
}

function handleCopyOrders() {
  if (sheetOrders.length === 0) {
    showAlert('無資料可複製', 'error');
    return;
  }

  let text = '🔖 今日點餐紀錄：\n';
  sheetOrders.forEach(order => {
    const emailPrefix = (order[1] || '').split('@')[0];
    text += `${emailPrefix}｜${order[2]} ${order[3]} ($${order[4]}) [${order[5] || '無'}]\n`;
  });

  navigator.clipboard.writeText(text).then(() => {
    showAlert('已成功複製清單內容。', 'success');
  }).catch(err => {
    showAlert('複製失敗。', 'error');
  });
}

/**
 * ==================================================
 * 9. 工具函式
 * ==================================================
 */
function showAlert(message, type = 'success') {
  dom.alertMessage.textContent = message;
  dom.alertMessage.className = `alert ${type}`;
  dom.alertMessage.classList.remove('hidden');

  setTimeout(() => {
    dom.alertMessage.classList.add('hidden');
  }, 3000);
}
