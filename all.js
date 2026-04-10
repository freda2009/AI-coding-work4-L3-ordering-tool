/**
 * ==================================================
 * 1. 環境變數設定
 * 以下常數為專案所需變數，本專案僅在前端執行，無後端與 secret key。
 * 請開發者填寫以下參數以執行程式：
 * ==================================================
 */
const API_KEY = '請填寫_您的_API_KEY';
const CLIENT_ID = '請填寫_您的_OAUTH_CLIENT_ID';
const SPREADSHEET_ID = '請填寫_您的_SPREADSHEET_ID';
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
  adminSetupSection: document.getElementById('admin-setup-section'),
  adminCheckboxes: document.getElementById('admin-restaurant-checkboxes'),
  saveTodayConfigBtn: document.getElementById('save-today-config-btn'),
  todayRestaurantsDisplay: document.getElementById('today-restaurants-display'),
  menuCardsContainer: document.getElementById('menu-cards-container'),
  ordersListContainer: document.getElementById('orders-list-container'),
  copyOrdersBtn: document.getElementById('copy-orders-btn'),
  clearOrdersBtn: document.getElementById('clear-orders-btn')
};

/**
 * ==================================================
 * 3. 認證邏輯：使用 Google Identity Services
 * ==================================================
 */
let tokenClient;

// Google APIs 載入完畢後初始化
window.onload = function () {
  // 初始化 Token Client (隱含流程 Implicit Flow)
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

  // 綁定登入按鈕
  dom.authBtn.addEventListener('click', () => {
    tokenClient.requestAccessToken();
  });
  
  // 綁定管理員 / 功能按鈕
  dom.saveTodayConfigBtn.addEventListener('click', handleSaveTodayConfig);
  dom.copyOrdersBtn.addEventListener('click', handleCopyOrders);
  dom.clearOrdersBtn.addEventListener('click', handleClearOrders);
};

// 取得 Access Token 後的流程
async function handleLoginSuccess() {
  dom.authBtn.textContent = '登入中...';
  dom.authBtn.disabled = true;

  try {
    // 1. 取得使用者 Email
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const userInfo = await userInfoRes.json();
    userEmail = userInfo.email;

    // 2. 取得 Users 工作表比對身分
    await fetchAllData();
    checkUserPermission();
    
  } catch (error) {
    console.error('Login error:', error);
    showAlert('登入或讀取資料發生錯誤', 'error');
  } finally {
    dom.authBtn.textContent = '使用 Google 帳號登入授權';
    dom.authBtn.disabled = false;
  }
}

/**
 * ==================================================
 * 4. 試算表操作與權限判斷
 * ==================================================
 */

// 通用 Fetch 函式
async function fetchSheetData(range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?key=${API_KEY}`;
  // 由於我們也用 OAuth Token，可帶入 Authorization 提供最佳相容性（如果試算表未公開的話）
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await res.json();
  // 回傳陣列（如果為空則回傳 []），省略標題列
  return data.values ? data.values.slice(1) : []; 
}

// 取得所有必要資料
async function fetchAllData() {
  sheetUsers = await fetchSheetData('Users!A:C');
  sheetMenu = await fetchSheetData('Menu!A:D');
  const rawToday = await fetchSheetData('TodayConfig!A:A');
  sheetTodayConfig = rawToday.map(row => row[0]).filter(Boolean);
  sheetOrders = await fetchSheetData('Orders!A:F');
}

// 身分檢查與畫面更新
function checkUserPermission() {
  // 從 Users 工作表尋找使用者 (欄位結構: 姓名=0, Email=1, 權限=2)
  const user = sheetUsers.find(row => row[1] === userEmail);

  if (!user) {
    showAlert(`未獲授權：${userEmail} 不在名單內`, 'error');
    return;
  }

  // 設定全域狀態
  dom.userNameDisplay.textContent = user[0] || userEmail;
  userRole = user[2] || '一般成員';
  dom.userRoleBadge.textContent = userRole;
  dom.userInfo.classList.remove('hidden');

  // 切換 UI 顯示
  dom.loginContainer.classList.add('hidden');
  dom.appContainer.classList.remove('hidden');

  if (userRole === '管理員') {
    document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
    renderAdminCheckboxes();
  } else {
    document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
  }

  // 渲染頁面資訊
  renderTodayMenu();
  renderOrdersList();
}

/**
 * ==================================================
 * 5. 渲染與功能實作：設定今日餐點 (管理員)
 * ==================================================
 */
function renderAdminCheckboxes() {
  // 取得不重複的餐廳名稱 (Menu 工作表欄位結構: 餐廳名稱=0)
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

// 將勾選的餐廳寫入 TodayConfig
async function handleSaveTodayConfig() {
  dom.saveTodayConfigBtn.disabled = true;
  dom.saveTodayConfigBtn.textContent = '儲存中...';

  // 取得選取的餐廳
  const checkboxes = dom.adminCheckboxes.querySelectorAll('input[type="checkbox"]:checked');
  const selected = Array.from(checkboxes).map(cb => [cb.value]); // 轉為 2D 陣列 API 格式

  try {
    // 寫入包含標題第一列與資料：資料格式: [[今日開放餐廳], [餐廳A], [餐廳B]]
    const bodyValues = [['今日開放餐廳'], ...selected];

    // 更新資料 (覆蓋 A 欄)
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/TodayConfig!A:A?valueInputOption=USER_ENTERED`;
    await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values: bodyValues })
    });

    // 重新拉取資料並渲染畫面
    await fetchAllData();
    renderTodayMenu();
    showAlert('今日餐廳設定已更新', 'success');
  } catch (err) {
    console.error(err);
    showAlert('設定失敗', 'error');
  } finally {
    dom.saveTodayConfigBtn.disabled = false;
    dom.saveTodayConfigBtn.textContent = '儲存設定';
  }
}

/**
 * ==================================================
 * 6. 渲染與功能實作：點餐介面與送出訂單
 * ==================================================
 */
function renderTodayMenu() {
  // 顯示今日餐廳名單
  dom.todayRestaurantsDisplay.textContent = sheetTodayConfig.length > 0 ? sheetTodayConfig.join('、') : '今日尚未設定餐廳';

  // 過濾屬於今日餐廳的餐點
  const todayMenuItems = sheetMenu.filter(item => sheetTodayConfig.includes(item[0]));
  dom.menuCardsContainer.innerHTML = '';

  if (todayMenuItems.length === 0) {
    dom.menuCardsContainer.innerHTML = '<p class="text-muted">管理員尚未開放今日點餐，或開放的餐廳無菜單</p>';
    return;
  }

  // 渲染卡片
  todayMenuItems.forEach((item, index) => {
    // Menu 結構: 餐廳名稱=0, 品名=1, 單價=2, 分類=3
    const restName = item[0];
    const itemName = item[1];
    const itemPrice = item[2];

    const card = document.createElement('div');
    card.className = 'menu-card';
    card.innerHTML = `
      <div style="flex: 1;">
        <span class="badge" style="background: var(--secondary-color); margin-bottom: 5px; margin-left: 0; display: inline-block;">${restName}</span>
        <h4>${itemName}</h4>
        <div class="price">$${itemPrice}</div>
      </div>
      <div>
        <input type="text" id="remark-${index}" placeholder="備註 (例: 微糖少冰, 不要菜)">
        <button class="btn btn-primary" style="width: 100%" onclick="handleOrder('${restName}', '${itemName}', '${itemPrice}', 'remark-${index}')">點一份</button>
      </div>
    `;
    dom.menuCardsContainer.appendChild(card);
  });
}

// 送出訂單 (Append 寫入 Orders 工作表)
window.handleOrder = async function(restName, itemName, itemPrice, remarkInputId) {
  const remarkStr = document.getElementById(remarkInputId).value || '無';
  
  // 取得台北時間的簡單格式 (YYYY/MM/DD HH:mm)
  const now = new Date();
  const timeStr = `${now.getFullYear()}/${String(now.getMonth()+1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  
  // 準備追加的資料 (Orders 欄位: 點餐時間, 訂購人 Email, 餐廳名稱, 餐點內容, 金額, 備註)
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

    // 提示成功，清空備註框，重新整理訂單列表
    document.getElementById(remarkInputId).value = '';
    showAlert(`已成功點餐：${restName} - ${itemName}`, 'success');
    
    // 重新抓取並列出
    await fetchAllData();
    renderOrdersList();

  } catch (err) {
    console.error(err);
    showAlert('點餐失敗', 'error');
  }
}

/**
 * ==================================================
 * 7. 渲染與功能實作：確認訂單與清空 (管理員)
 * ==================================================
 */
function renderOrdersList() {
  dom.ordersListContainer.innerHTML = '';
  if (sheetOrders.length === 0) {
    dom.ordersListContainer.innerHTML = '<div style="padding:10px; color:#666;">今日無人點餐。</div>';
    return;
  }

  sheetOrders.forEach(order => {
    // Orders 預期: 點餐時間=0, Email=1, 餐廳=2, 餐點=3, 金額=4, 備註=5
    const emailPrefix = (order[1] || '').split('@')[0];
    const html = `
      <div class="order-item">
        <strong>${emailPrefix}</strong> 點了：
        <span style="color:var(--primary-color)">${order[2]} - ${order[3]}</span> 
        ($${order[4]}) 
        <small style="color:#666;">備註: ${order[5] || '無'}</small>
      </div>
    `;
    dom.ordersListContainer.insertAdjacentHTML('beforeend', html);
  });
}

// 一鍵複製
function handleCopyOrders() {
  if (sheetOrders.length === 0) {
    showAlert('目前沒有訂單可複製', 'error');
    return;
  }
  
  let text = '🚀 今日點餐統計：\n';
  sheetOrders.forEach(order => {
    const emailPrefix = (order[1] || '').split('@')[0];
    text += `- ${emailPrefix}: ${order[2]} ${order[3]} ($${order[4]}) [${order[5] || '無'}]\n`;
  });

  navigator.clipboard.writeText(text).then(() => {
    showAlert('已成功複製到剪貼簿，可直接貼上 Line 或 Slack！', 'success');
  }).catch(err => {
    showAlert('複製失敗', 'error');
  });
}

// 管理員：清空今天點餐記錄
async function handleClearOrders() {
  if (!confirm('您確認要清空 [Orders] 中除了標題列以外的所有資料嗎？這是不可逆的操作！')) {
    return;
  }

  try {
    // 清空 A2 到 F
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/Orders!A2:F:clear`;
    await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      }
    });

    showAlert('已成功清空今日訂單', 'success');
    await fetchAllData();
    renderOrdersList();

  } catch (err) {
    console.error(err);
    showAlert('清空訂單失敗', 'error');
  }
}

/**
 * ==================================================
 * 8. 共用小工具 (UI 提示)
 * ==================================================
 */
function showAlert(message, type = 'success') {
  dom.alertMessage.textContent = message;
  dom.alertMessage.className = `alert ${type}`;
  dom.alertMessage.classList.remove('hidden');

  // 3 秒後自動隱藏
  setTimeout(() => {
    dom.alertMessage.classList.add('hidden');
  }, 3000);
}
