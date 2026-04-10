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

// 時間狀態
let orderStartTime = '';
let orderEndTime = '';

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
  configStartTime: document.getElementById('config-start-time'),
  configEndTime: document.getElementById('config-end-time'),
  saveTodayConfigBtn: document.getElementById('save-today-config-btn'),
  clearOrdersBtn: document.getElementById('clear-orders-btn'),
  
  // 菜單管理
  adminMenuList: document.getElementById('admin-menu-list'),
  addMenuItemBtn: document.getElementById('add-menu-item-btn'),
  saveMenuBtn: document.getElementById('save-menu-btn'),

  // 點餐區
  orderTimeStatus: document.getElementById('order-time-status'),
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
  
  dom.addMenuItemBtn.addEventListener('click', handleAddMenuItem);
  dom.saveMenuBtn.addEventListener('click', handleSaveMenu);

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
  sheetOrders = await fetchSheetData('Orders!A:F');
  
  // 處理 TodayConfig (A欄:餐廳, B欄:空, C欄:開始時間, D欄:結束時間)
  const rawToday = await fetchSheetData('TodayConfig!A:D');
  sheetTodayConfig = rawToday.map(row => row[0]).filter(Boolean);
  
  if (rawToday.length > 0) {
    orderStartTime = rawToday[0][2] || '';
    orderEndTime   = rawToday[0][3] || '';
  } else {
    orderStartTime = '';
    orderEndTime   = '';
  }
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
    renderAdminMenuList();
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
      
      // 當切換到點餐區時，重新確保時間有效性並更新卡片按鈕
      if (targetId === 'tab-order') {
        renderTodayMenu();
      }
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
 * 6. 管理員專區邏輯 (TodayConfig & Menu CRUD)
 * ==================================================
 */
function renderAdminCheckboxes() {
  const restaurants = [...new Set(sheetMenu.map(item => item[0]))];
  dom.adminCheckboxes.innerHTML = '';
  
  dom.configStartTime.value = orderStartTime;
  dom.configEndTime.value = orderEndTime;

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
  const selected = Array.from(checkboxes).map(cb => cb.value);
  
  const startT = dom.configStartTime.value || '';
  const endT = dom.configEndTime.value || '';
  
  // 建立標題列
  let bodyValues = [['今日開放餐廳', '', '開始時間', '結束時間']];
  
  // 第一列資料加上時間設定
  if (selected.length > 0) {
    bodyValues.push([selected[0], '', startT, endT]);
    // 剩下的資料
    for(let i = 1; i < selected.length; i++) {
       bodyValues.push([selected[i]]);
    }
  } else {
    bodyValues.push(['', '', startT, endT]);
  }

  try {
    // 1. 先清除舊的設定
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/TodayConfig!A:D:clear`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    // 2. 寫入新的設定
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/TodayConfig!A1:D?valueInputOption=USER_ENTERED`;
    await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values: bodyValues })
    });

    await fetchAllData();
    // 同步更新管理員的勾選框與時間狀態
    renderAdminCheckboxes();
    renderTodayMenu();
    showAlert('設定已更新，點餐區已同步，系統已自動為您儲存時間', 'success');
  } catch (err) {
    console.error(err);
    showAlert('設定失敗', 'error');
  } finally {
    dom.saveTodayConfigBtn.disabled = false;
    dom.saveTodayConfigBtn.textContent = '儲存開放設定';
  }
}

// 渲染目前所有的菜單資料到後台表格
function renderAdminMenuList() {
  dom.adminMenuList.innerHTML = '';
  sheetMenu.forEach((item, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" value="${item[0] || ''}"></td>
      <td><input type="text" value="${item[1] || ''}"></td>
      <td><input type="text" value="${item[2] || ''}"></td>
      <td><input type="text" value="${item[3] || ''}"></td>
      <td><button class="btn btn-danger" style="padding: 4px 10px; font-size:0.8rem;" onclick="handleRemoveMenuItem(this)">刪除</button></td>
    `;
    dom.adminMenuList.appendChild(tr);
  });
}

// 新增空白菜單列
function handleAddMenuItem() {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" placeholder="餐廳名稱"></td>
    <td><input type="text" placeholder="品名"></td>
    <td><input type="text" placeholder="單價"></td>
    <td><input type="text" placeholder="分類"></td>
    <td><button class="btn btn-danger" style="padding: 4px 10px; font-size:0.8rem;" onclick="handleRemoveMenuItem(this)">刪除</button></td>
  `;
  dom.adminMenuList.prepend(tr);
}

// 移除當前按下的這列（僅畫面）
window.handleRemoveMenuItem = function(btn) {
  const tr = btn.closest('tr');
  if (tr) {
    tr.remove();
  }
}

// 儲存整份菜單 (CRUD) 回寫 Google Sheet
async function handleSaveMenu() {
  dom.saveMenuBtn.disabled = true;
  dom.saveMenuBtn.textContent = 'Saving...';

  // 1. 從 DOM 擷取最新資料
  const rows = Array.from(dom.adminMenuList.querySelectorAll('tr'));
  const newMenuData = rows.map(tr => {
    const inputs = tr.querySelectorAll('input');
    return [inputs[0].value.trim(), inputs[1].value.trim(), inputs[2].value.trim(), inputs[3].value.trim()];
  }).filter(row => row[0] !== '' && row[1] !== ''); // 過濾空資料

  const bodyValues = [['餐廳名稱', '品名', '單價', '分類'], ...newMenuData];

  try {
    // 2. 清除原本的所有菜單資料
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/Menu!A:D:clear`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    // 3. 寫回新資料
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/Menu!A1:D?valueInputOption=USER_ENTERED`;
    await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values: bodyValues })
    });

    await fetchAllData();
    renderAdminCheckboxes(); // 同步更新餐廳列表
    renderAdminMenuList();   // 整理一下畫面
    renderTodayMenu();       // 點餐區更新
    showAlert('菜單已儲存覆寫成功', 'success');
  } catch (err) {
    console.error(err);
    showAlert('菜單儲存失敗', 'error');
  } finally {
    dom.saveMenuBtn.disabled = false;
    dom.saveMenuBtn.textContent = '儲存菜單變更';
  }
}

// 清空所有訂單
async function handleClearOrders() {
  if (!confirm('您確認要清空所有點餐資料嗎？此操作不可逆。')) {
    return;
  }
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/Orders!A2:F:clear`;
    await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` } });
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
 * 7. 點餐專區邏輯 (包含時間驗證)
 * ==================================================
 */
// 檢查目前是否可以點餐
function isOrderTimeValid() {
  if (!orderStartTime || !orderEndTime) return true; // 若無設定則開放
  
  const now = new Date();
  const nowH = String(now.getHours()).padStart(2, '0');
  const nowM = String(now.getMinutes()).padStart(2, '0');
  const nowStr = `${nowH}:${nowM}`;
  
  if (nowStr >= orderStartTime && nowStr <= orderEndTime) {
    return true;
  }
  return false;
}

function renderTodayMenu() {
  // 更新開放時間文字標示
  if (!orderStartTime && !orderEndTime) {
    dom.orderTimeStatus.textContent = '目前未限制點餐時間';
    dom.orderTimeStatus.className = 'badge bg-gray';
  } else {
    // 有設定時間
    const timeValid = isOrderTimeValid();
    dom.orderTimeStatus.textContent = timeValid ? `開放點餐 (${orderStartTime}~${orderEndTime})` : `已過點餐時間 (${orderStartTime}~${orderEndTime})`;
    dom.orderTimeStatus.className = timeValid ? 'badge bg-success' : 'badge bg-danger';
  }

  dom.todayRestaurantsDisplay.textContent = sheetTodayConfig.length > 0 ? sheetTodayConfig.join('、') : '目前尚未設定';
  
  const todayMenuItems = sheetMenu.filter(item => sheetTodayConfig.includes(item[0]));
  dom.menuCardsContainer.innerHTML = '';

  if (todayMenuItems.length === 0) {
    dom.menuCardsContainer.innerHTML = '<p class="text-muted">管理員尚未設定今日菜單，請通知管理員前往設定。</p>';
    return;
  }

  // 決定按鈕是否能點擊
  const isValidTime = isOrderTimeValid();
  const btnText = isValidTime ? '點餐' : '不在開放時段內';
  const btnDisabledAttr = isValidTime ? '' : 'disabled';

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
        <button class="btn btn-outline" style="width: 100%" onclick="handleOrder('${restName}', '${itemName}', '${itemPrice}', 'remark-${index}')" ${btnDisabledAttr}>${btnText}</button>
      </div>
    `;
    dom.menuCardsContainer.appendChild(card);
  });
}

window.handleOrder = async function (restName, itemName, itemPrice, remarkInputId) {
  // 送出前的雙保險時效檢查
  if (!isOrderTimeValid()) {
    showAlert('目前不在開放時間範圍內，無法點單！', 'error');
    return;
  }

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
