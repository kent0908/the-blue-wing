# 把 The Blue Wing 推到 GitHub（Windows 手把手）

前提：你已經有 GitHub 帳號。整個流程大約 10 分鐘。

> **好消息**：zip 裡面已經有 `.git` 資料夾，程式碼也已經 commit 好了。
> 所以你不用 `git init`，也不用 `git add` / `git commit` —— 只要「連上 GitHub 然後推上去」這兩步。

---

## 步驟 1：安裝 Git for Windows

1. 開 <https://git-scm.com/download/win>，網頁會自動下載 64-bit 安裝檔。
2. 打開下載的 `.exe`，一路按 **Next** 到底，再按 **Install**。
   全部用預設值就好，不需要改任何選項。
3. 裝完後按 **Finish**（「View Release Notes」的勾可以取消）。

**確認裝好了**：按 `Win + X` → 選 **終端機** 或 **Windows PowerShell**，輸入：

```powershell
git --version
```

出現類似 `git version 2.47.1.windows.1` 就成功了。
如果顯示「無法辨識 'git' 」，把終端機視窗**整個關掉重開**再試一次（安裝程式改了 PATH，舊視窗讀不到）。

---

## 步驟 2：解壓縮專案

1. 找到我傳給你的 `blue-wing.zip`（通常在「下載」資料夾）。
2. **右鍵 → 解壓縮全部 → 解壓縮**。
3. 解開後會有一個 `blue-wing` 資料夾。**把它移到你好找的位置**，例如：

   ```
   C:\Users\你的使用者名稱\Documents\blue-wing
   ```

   > 避免放在「下載」資料夾裡，之後容易誤刪。
   > 也避免路徑中有中文或空白，可以省掉一些麻煩。

---

## 步驟 3：在專案資料夾開啟終端機

最簡單的方法：

1. 用檔案總管打開 `blue-wing` 資料夾（就是裡面看得到 `package.json` 的那一層）。
2. 在網址列（上方顯示路徑的地方）**點一下**，把路徑反白。
3. 直接輸入 `powershell` 然後按 Enter。

終端機會在正確的資料夾開啟。確認一下：

```powershell
dir
```

要看得到 `package.json`、`app`、`components`、`lib` 這些項目。
**看不到就是位置不對**，別往下做。

---

## 步驟 4：設定你的 Git 身分（只需要做一次）

Git 每筆 commit 都要記錄「是誰做的」。輸入這兩行（換成你自己的）：

```powershell
git config --global user.name "Kent"
git config --global user.email "a184a184@gmail.com"
```

> email 建議用你 GitHub 帳號的那個，這樣 commit 才會正確歸到你名下。

---

## 步驟 5：在 GitHub 上開一個空的 repo

1. 開 <https://github.com/new>。
2. **Repository name**：`blue-wing`
3. **Description**：可留空。
4. **Public / Private**：建議先選 **Private**（私人）。之後隨時能改公開。
5. ⚠️ **最重要的一步**：下面 **Initialize this repository with** 那一區的三個選項
   —— `Add a README file`、`Add .gitignore`、`Choose a license`
   —— **三個都不要勾**。

   > 勾了會在 GitHub 上先產生一筆 commit，跟你本機的歷史對不起來，
   > push 時就會噴 `rejected ... fetch first` 的錯誤。

6. 按綠色的 **Create repository**。

建好後會看到一個「…or push an existing repository from the command line」的區塊，
裡面有一行 `git remote add origin https://github.com/xxx/blue-wing.git`。
**把那個網址記下來**（或按旁邊的複製鈕），下一步要用。

---

## 步驟 6：連上 GitHub 並推送

回到步驟 3 的終端機，依序輸入這三行。

**第一行** —— 告訴本機「要推到哪」。把網址換成上一步複製的那個：

```powershell
git remote add origin https://github.com/你的帳號/blue-wing.git
```

沒有任何輸出就是成功了。可以確認一下：

```powershell
git remote -v
```

會列出兩行 `origin ... (fetch)` 和 `origin ... (push)`。

**第二行** —— 確認分支名稱是 `main`：

```powershell
git branch -M main
```

**第三行** —— 推上去：

```powershell
git push -u origin main
```

### 這時會跳出登入視窗

第一次 push，Windows 會彈出一個 **「Connect to GitHub」** 的視窗：

- 選 **Sign in with your browser**
- 瀏覽器會開啟 GitHub 授權頁 → 按 **Authorize**
- 授權完關掉瀏覽器分頁，回到終端機，push 會自己繼續

> 這是 Git Credential Manager 在幫你處理，**不需要輸入密碼，也不用自己去產生 token**。
> 之後再 push 就不會再問了。

看到類似這樣就成功了：

```
Enumerating objects: 45, done.
...
To https://github.com/你的帳號/blue-wing.git
 * [new branch]      main -> main
branch 'main' set up to track 'origin/main'.
```

**回 GitHub 重新整理頁面**，程式碼就都在上面了。

---

## 步驟 7（重要）：確認 key 沒有被推上去

`.env.local`（放 API key 的檔案）已經寫在 `.gitignore` 裡，也沒有被打包進 zip，
所以正常情況下它不會上 GitHub。但還是花 10 秒確認一次：

在 GitHub 的檔案列表裡找 —— **不應該**看到 `.env.local`。
只會看到 `.env.example`，那個裡面是 `sk-...` 的假值，沒問題。

> 如果哪天不小心推了含 key 的檔案上去，**不要只是刪掉再 commit**——
> 歷史裡還留著。正確做法是馬上到 <https://console.siraya.ai/api-keys>
> 把那把 key 撤銷，重新產一把。

---

## 之後要怎麼更新

改完程式碼後，三行：

```powershell
git add -A
git commit -m "說明這次改了什麼"
git push
```

---

## 接下來：接 Vercel

程式碼上 GitHub 之後，部署就很簡單了：

1. 開 <https://vercel.com/new>，用 GitHub 帳號登入。
2. 找到 `blue-wing` 這個 repo，按 **Import**。
   （如果列表裡沒有，按 **Adjust GitHub App Permissions** 給 Vercel 存取權限。）
3. 展開 **Environment Variables**，加一筆：
   - Name：`SIRAYA_API_KEY`
   - Value：你的 `sk-...`
   - 三個環境（Production / Preview / Development）**都要勾**
4. 按 **Deploy**。

Framework 會自動認成 Next.js，Build Command 跟 Output Directory 都不用改。
之後每次 `git push`，Vercel 會自動重新部署。

---

## 卡住的時候

| 訊息 | 意思 / 怎麼辦 |
| --- | --- |
| `'git' 不是內部或外部命令` | Git 沒裝好，或終端機視窗要關掉重開。 |
| `fatal: not a git repository` | 你不在 `blue-wing` 資料夾裡。`dir` 看得到 `package.json` 才對。 |
| `remote origin already exists` | remote 加過了。改用 `git remote set-url origin <網址>`。 |
| `Updates were rejected... fetch first` | GitHub 上的 repo 不是空的（步驟 5 勾到 README 了）。最快的解法：把 GitHub 上那個 repo 刪掉，照步驟 5 重開一個乾淨的。 |
| `Support for password authentication was removed` | 不要用密碼。關掉重跑 `git push`，等瀏覽器登入視窗跳出來。 |
| `src refspec main does not match any` | 分支名不對。跑 `git branch -M main` 再 push。 |
