# 公司內部點餐工具實作計畫

本計畫旨在建立一個基於純 HTML/CSS/JS 的點餐工具，無須後端伺服器，直接與 Google Sheets 互動。

## 使用者確認需求 (User Review Required)

> [!IMPORTANT]
> 為了讓這個前端應用程式能夠順利執行，我們會需要在程式碼中放入兩個公開的環境變數。請確認您是否已經具備：
> 1. **Google OAuth Client ID**：由於我們不需要後端，這應該是一個設定為「網頁應用程式」的 OAuth 2.0 用戶端 ID，並且需要在 Google Cloud Console 中授權使用者的來源網域（若是本地端測試，則為 `http://localhost` 或 `http://127.0.0.1`）。
> 2. **Google 試算表 ID (Spreadsheet ID)**：也就是 Google Sheets 網址中的隨機字串，例如 `https://docs.google.com/spreadsheets/d/這一段就是ID/edit`。

在程式碼中，我將為這些設定預留常數（如 `CLIENT_ID` 及 `SPREADSHEET_ID`），到時候您可以直接填入。

## 架構與實作設計

本工具將會使用以下技術與服務：
- **Google Identity Services (GSI)**：用於取得使用者的身分（Email）並要求讀寫 Google Sheets 的權限（OAuth Token）。
- **Google Sheets API v4**：使用 REST API 配合取得的 Access Token 來進行資料的讀取（針對 `Users`, `TodayConfig`, `Menu`, `Orders` 工作表）以及寫入 / 刪除（針對 `Orders` 工作表）。

### 檔案規劃

---

#### [NEW] [index.html](file:///c:/github-test/260410/AI-coding-work4-L3-ordering-tool/index.html)
負責整體架構與引入 Google API：
- 引入 `<script src="https://accounts.google.com/gsi/client" async defer></script>` (登入與 Token 取得)。
- 建立登入畫面區塊與主要內容區塊。
- 顯示載入中的過場動畫或是狀態提示。
- 使用 Semantic HTML (如 `<header>`, `<body>`, `<main>`)。

#### [NEW] [all.css](file:///c:/github-test/260410/AI-coding-work4-L3-ordering-tool/all.css)
整體樣式與響應式設計：
- 實作「單色、典雅風」的 UI，主要採用黑、白、灰色階排版，呈現簡約且具質感的專業介面。
- 全域色彩與 Typography（例如使用 Google Fonts 的 Inter 或 Noto Sans TC）。
- RWD (Responsive Web Design) 斷點設定以支援行動裝置與電腦。
- 增加分頁切換（Tab Navigation）相關的樣式設計，包含分頁按鈕的被選取（Active）狀態等。

#### [NEW] [all.js](file:///c:/github-test/260410/AI-coding-work4-L3-ordering-tool/all.js)
核心邏輯與 API 互動，使用 ES6 語法，模組化設計函式：
- **環境變數設定**：在檔案最上方設定常數，請開發者自行填寫 `API_KEY`、`CLIENT_ID` 以及 `SPREADSHEET_ID`。
- **認證邏輯**：觸發 GSI 取出 Token，並用 Token 獲取使用者 Email。
- **試算表操作邏輯**：
  - 讀取資料：使用 `gapi.client.sheets` 或是透過 `fetch` 加上 OAuth 取得 `Users`, `Menu`, `TodayConfig`, `Orders`。
  - 寫入資料：透過 `POST` 給 `Orders` 追加一筆資料。
  - 寫入設定：由管理員更新 `TodayConfig`（今日開放餐廳、**開始點餐時間、結束點餐時間**）的內容。
  - **菜單管理**：提供管理員整批讀取目前 `Menu`，在前端進行新增、修改、刪除後，透過 `clear` 加上 `update` 覆寫回 `Menu` 工作表。
  - 清空資料：管理員模式下觸發清除 `Orders` 除了標題以外的資料。
- **狀態管理與 UI 更新 (詳細網頁功能要求)**：
  1. **登入介面**：顯示一個明顯的 Google 登入按鈕，本專案將純前端執行，不使用後端 secret key。
  2. **身分檢查與分頁導覽**：
     - 登入成功後取得 Email，檢查 Email 是否在 `Users` 表中。
     - 在名單內者顯示導覽列（包含「點餐區」與「確認訂單區」的分頁）。
     - 若為管理員，導覽列會多出一個「管理員專區」的分頁。預設畫面皆為進入「點餐區」，確保管理員也能正常點餐。
  3. **設定今日餐點與開放時間 (管理員專屬分頁)**：
     - 從 `Menu` 表撈出不重複的餐廳名稱列表。
     - 管理員可在該分頁勾選今天選用的餐廳。
     - **新增時間設定：** 管理員可設定「開放訂餐開始時間」與「結束時間」（如 10:00 ~ 12:00）。
     - 設定完成後寫入 `TodayConfig` 工作表（A欄紀錄餐廳，C1、D1 紀錄時間），並**強制觸發點餐區的再次渲染連動**。
     - **管理菜單功能：** 顯示目前 `Menu` 表的列表，提供「新增餐點」、「編輯餐點」與「刪除按鈕」。修改完成後覆寫整張 `Menu` 表。
  4. **點餐介面 (預設點餐區分頁)**：
     - 讀取 `TodayConfig` 取得今日餐廳名稱與**訂餐時間範圍**。
     - **時間驗證機制：** 顯示目前設定的時間範圍。若當下時間不在範圍內，按鈕反灰不允許點餐，點擊時跳出警告「不在開放點餐時間內」。
     - 從 `Menu` 中過濾出「屬於今日餐廳」的餐點，並以單色優雅的卡片顯示（含品名、單價、備註、點餐按鈕）。
  5. **送出訂單**：
     - 點擊後檢查時間是否超時，若合法則將資料（時、Email、餐廳、餐點、金額、備註）寫入 `Orders` 工作表最下方，並顯示提示訊息。
  6. **確認訂單 (確認訂單區分頁)**：
     - 列出今天的餐點列表。提供「一鍵複製」按鈕，格式化成清單。
  7. **管理員專區**：
     - 若權限為「管理員」，頁面底部會出現紅色的「清空今日點餐」按鈕。
     - 點擊可彈出確認視窗，確認後，刪除 `Orders` 表中除了第一列(標題列)以外的所有資料。

## 待確認的問題 (Open Questions)

> [!WARNING]
> 無！該需求已非常清楚，若您同意上述的實作方式與常數宣告，請直接核准，我將這三支檔案產生並加入詳細中文註解給您。

## 驗證方式 (Verification Plan)
1. 在本地端（例如使用 VS Code Live Server 或 Python `http.server`）運行 `index.html`。
2. 開發者開啟並將自己的 Client ID 與 Spreadsheet ID 填入 `all.js`，檢查登入功能。
3. 測試授權登入後，畫面將根據測試 Google 帳號與是否在名單內給定權限。
