# 冷杉 Cedar Web — Claude Code 工作說明

## 專案背景

冷杉（Cold Cedar）是一間 AI 原生控股生態系公司，核心服務是用 AI 神經系統接管傳統中型企業的後台職能，協助即將退休、面臨接班問題的傳統企業老闆讓公司繼續自動運轉。

第一個驗證案例是捷行國際家居（台中高端家居代理商），導入後成本壓縮 70–80%，月費 11 萬取代市場行情 35–51 萬，建置費兩個月回本。

**網站定位：** 給傳統企業老闆看的服務說明網站
**第一優先受眾：** 潛在客戶（傳統企業老闆）
**次要受眾：** 投資人
**必備功能：** 預約諮詢表單，送出後 Email 通知

---

## 資料夾結構
```
cedar-web/
├── CLAUDE.md
├── research/
│   ├── competitor-analysis.md
│   └── seo-geo-guidelines.md
├── design/
│   ├── site-architecture.md
│   ├── wireframes.md
│   └── visual-style.md
├── content/
│   ├── home.md
│   ├── about.md
│   ├── solution.md
│   ├── case-study.md
│   └── contact.md
└── src/
    ├── index.html
    ├── about.html
    ├── solution.html
    ├── case.html
    ├── contact.html
    ├── css/
    │   └── style.css
    └── js/
        └── main.js
```

---

## 執行原則

### 每個任務開始前
1. 讀取對應的 GitHub issue 確認任務範圍
2. 確認前置條件的 issue 是否已完成
3. 如果前置條件未完成，停下來告知，不要跳過

### 每個任務完成後
1. 把產出寫入對應的檔案（路徑見上方結構）
2. git add + git commit，commit message 格式：
   `[Issue #N] 任務標題簡述`
3. git push 到 main branch
4. 透過 GitHub API 關閉對應的 issue，並留言：「已完成，產出見 [檔案路徑]」

### 需要 Peter 確認的節點
以下 issue 完成後必須停下來等待 Peter 確認，不可自動繼續：
- Issue #4（競爭對手分析報告）→ 確認後才能開始 Phase 2
- Issue #5（頁面架構）→ 確認後才能開始 Issue #6、#7
- Issue #10（SEO/GEO 規範）→ 確認後才能開始 Phase 5
- Issue #12（視覺風格定稿）→ 確認後才能開始 Phase 6
- Phase 5 每個文案 issue → 確認後才能製作對應頁面

---

## 品牌規範

### 色彩系統
- 主色：深藏青 #1F3864
- 副色：中藍 #2E75B6
- 強調色：金色 #C9A84C
- 淺藍背景：#D9E8F5
- 白色：#FFFFFF
- 文字色：#1E293B

### 語言原則
- 對象是接近退休、面臨接班問題的傳統企業老闆
- 不用技術術語（避免：AI 神經系統、Fine-tuned Llama、LLM）
- 核心情緒：給他一個出口，而不是賣工具給他
- 語言要讓他聽得懂，不是對工程師說話

### 關鍵數字（必須正確）
- 成本壓縮幅度：70–80%
- 月費：11 萬（捷行特殊定價）vs 市場行情 35–51 萬
- 建置費：50 萬，兩個月回本
- 六個後台職能全數承接

---

## GitHub 資訊

- **Repo：** TrainerPlux/cedar-web
- **Issues 網址：** https://github.com/TrainerPlux/cedar-web/issues
- **執行順序：** 依 Phase 1 → Phase 7 的順序，每個 Phase 內依 issue 編號順序執行

---

## 啟動指令

進入 repo 並啟動 Claude Code 後，用以下指令開始：

「請讀取所有 open issues，從最小編號開始，確認前置條件後依序執行，產出寫入對應檔案，完成後 commit 並關閉 issue，遇到需要 Peter 確認的節點請停下來告知。」
