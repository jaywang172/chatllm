# NVIDIA NIM DeepSeek v4 Pro - ChatGPT Web UI 🚀

這是一個專為 **NVIDIA NIM** 平台上的 **DeepSeek V4 Pro**（以及 DeepSeek R1、Flash 等模型）量身打造的高級、精緻的 ChatGPT 雙向對話網頁系統。

本專案採用 **HTML + 現代 Vanilla CSS + ES6 Javascript** 打造，內建流暢的 Glassmorphic 玻璃擬態視覺設計，並附帶一個**零依賴的 Node.js 本地代理伺服器 (`server.js`)**，能夠一鍵完美繞過瀏覽器 CORS 安全阻擋，實現極致穩定的超高速 SSE 雙向串流連線！

---

## 🌟 核心特色

1. **極致高端的視覺風格**：
   - 採用 **NVIDIA 經典科技綠** 與 **DeepSeek 精緻霓虹藍** 的漸層搭配。
   - 搭載高雅的暗黑黑曜石背景、透光卡片與 Backdrop 模糊玻璃擬態 (Glassmorphism)。
   - 提供流暢的浮動、展開動畫與專為長文本/代碼區設計的自訂滾動條。
2. **DeepSeek 特製「思維過程」摺疊區**：
   - 在接收 DeepSeek 推理模型回傳時，即時渲染 `reasoning_content`（思維鏈）。
   - 附帶**高精度即時計時器**，直觀呈現 AI 在推理過程中所花費的秒數。
   - 推理完畢後，思維區自動摺疊並流暢過渡到主回答，防止文字過長影響閱讀。
3. **頂級 Markdown 與代碼渲染**：
   - 整合 `marked.js` 與 `highlight.js`，提供無懈可擊的程式碼排版。
   - **代碼區塊定製 Banner**：獨立顯示程式語言名稱，並內建「複製代碼 (Copy Code)」一鍵複製按鈕。
   - **數學公式支援**：集成 `KaTeX` 自動渲染，能完美展示行內公式 (e.g. `$E=mc^2$`) 及區塊公式 (e.g. `$$\int_{a}^{b} x^2 dx$$`)，最適合學術與技術寫作。
4. **完整的歷史會話管理器 (LocalStorage DB)**：
   - 支援多會話（Chat Threads）獨立存儲，即使關閉網頁、重新整理，歷史對話也絕不丟失。
   - 具備會話標題自訂編輯、單一會話刪除、一鍵清空功能。
   - 支援歷史對話檔案**匯出為 JSON** 或從備份**匯入復原**。
5. **進階參數快捷控制**：
   - 可在頂部 Header 快捷切換「思考深度」：`Think Max`（極致推理）、`Think High`（高級邏輯）、`Non-think`（快速回答）。
   - 可直接在頂部微調生成溫度 (Temperature) 數值。
   - 在設定面板中支援自訂 System Prompt（系統提示詞）、最大生成 Token 限制，甚至可以填寫任何自訂的 NVIDIA NIM 模型 ID。

---

## 🛠️ 如何快速啟動運行

本專案具有零外部 package 依賴的優點，只要您的電腦安裝了 **Node.js**，即可用最簡便的方式啟動！

### 第一步：在終端機中開啟此資料夾
```bash
cd /Users/jaywang/Desktop/chatdeepseek
```

### 第二步：啟動本地代理伺服器
```bash
node server.js
```
*啟動後，終端機會顯示：*
```text
🚀 Premium ChatGPT UI is active!
👉 Access URL: http://localhost:3000
💡 Connecting to NVIDIA NIM API with streaming support.
```

### 第三步：開啟瀏覽器
在瀏覽器輸入並前往： **[http://localhost:3000](http://localhost:3000)**

---

## ⚙️ 連線與 API 設定說明

1. **獲取 API Key**：
   - 前往 [NVIDIA API Catalog (build.nvidia.com)](https://build.nvidia.com/) 註冊或登入。
   - 搜尋並點擊 `DeepSeek-V4-Pro`，點擊「Get API Key」免費生成一個以 `nvapi-` 開頭的密鑰。
2. **填寫密鑰**：
   - 開啟網頁後，點擊左下角「設定與 API 密鑰」按鈕。
   - 在對話框中貼入 API Key，並點擊「儲存設定」即可。
   - *（安全提示：此密鑰純儲存於您本地瀏覽器的 LocalStorage，連線傳輸也是點對點發往官方節點，絕無第三方收集風險，安全無虞）*
3. **選擇連線管道**：
   - 建議維持預設的 **「本地代理伺服器 (Proxy Mode)」**，該模式會透過您的本地 Node.js 來進行 NVIDIA 官方 API 請求，保證不被瀏覽器 CORS 機制阻擋。
   - 如果您想靜態直接點擊 `index.html` 在非伺服器狀態下執行，可切換為「瀏覽器直連 (Direct Mode)」，但請確保您的瀏覽器允許跨域請求。

---

## 🤖 支援模型對照

在設定中，您可以從預設下拉選單切換，或自訂填入其他 NVIDIA NIM 官方模型：

| 模型顯示名稱 | 官方 API 模型 ID | 特色描述 |
| :--- | :--- | :--- |
| **DeepSeek V4 Pro** | `deepseek-ai/deepseek-v4-pro` | 1.6 兆參數混合專家推理大模型（本站預設，強力推薦） |
| **DeepSeek V4 Flash** | `deepseek-ai/deepseek-v4-flash` | 極速輕量版，超低延遲，回答迅速 |
| **DeepSeek R1** | `deepseek-ai/deepseek-r1` | 專為超高難度數理、邏輯推理設計的深度推理模型 |

也支援在設定中自訂填入其他 Llama 3.1、Nemotron 等模型 ID 以進行多功能擴充。
