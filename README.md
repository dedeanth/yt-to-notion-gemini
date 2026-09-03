# YouTube to Notion - AI Summarizer & Saver 🚀

A modern Chrome Extension (Manifest V3) that summarizes YouTube videos using **Google Gemini AI** and saves the video link, summary, takeaways, and tags directly to your **Notion** database with one click.

---

## ✨ Features

- 🎯 **One-Click Video Capture**: Automatically extracts video title, author, URL, thumbnail, and full caption transcript.
- 🧠 **Gemini AI Summarization**: Uses Google Gemini (`gemini-3.6-flash` or `gemini-1.5-flash`) to generate structured overviews, bulleted takeaways, and smart categorization tags.
- 🏷️ **Interactive Tag Editor**: Review, edit, add, or remove tags directly in the popup before saving.
- 📓 **Rich Notion Formatting**:
  - Sets database properties: **Title**, **Video URL**, and **Multi-Select Tags**.
  - Appends rich formatted blocks inside the Notion page: **Header Callout**, **AI Summary Overview**, **Key Takeaways (bullets)**, and a **Collapsible Full Transcript toggle**.
  - Automatically sets the video thumbnail as the Notion page cover.
- 🔍 **Dynamic Database Schema Auto-Mapping**: Automatically detects your database properties regardless of what you named them (`Name`, `Title`, `URL`, `Tags`, etc.).

---

## 🛠️ Step-by-Step Setup Guide

### 1. Load the Extension into Google Chrome

1. Open Google Chrome and go to `chrome://extensions/`.
2. Toggle on **Developer mode** in the top-right corner.
3. Click **Load unpacked** in the top-left corner.
4. Select this folder:
   ```
   C:\Users\antho\.gemini\antigravity\scratch\yt-to-notion-gemini
   ```
5. Pin the extension icon to your Chrome toolbar for easy access.

---

### 2. Get your Google Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Sign in with your Google account.
3. Click **Create API key** (free tier available).
4. Copy your API key.

---

### 3. Set up your Notion Database & Integration

#### Step A: Create an Internal Integration
1. Go to [notion.so/profile/integrations](https://www.notion.so/profile/integrations).
2. Click **New integration**.
3. Name it (e.g. `YouTube Saver`) and select your workspace.
4. Set capabilities to **Read content**, **Update content**, and **Insert content**.
5. Click **Save** and copy the **Internal Integration Secret** (`secret_...`).

#### Step B: Prepare your Notion Database
You can use an existing database or create a new one (Full page or Inline table) with these suggested properties:

| Property Name | Property Type | Description |
| :--- | :--- | :--- |
| **Name** (or Title) | `Title` | Video title |
| **URL** | `URL` | Link to the YouTube video |
| **Tags** | `Multi-select` | Categorization tags |
| **Summary** *(optional)* | `Text / Rich text` | Short summary (also saved in body) |

#### Step C: Connect your Integration to the Database
1. Open your Notion database in Notion.
2. Click the **`...`** menu in the top-right corner of the database page.
3. Scroll down and click **Connections** &rarr; **Connect to**.
4. Search for your integration name (e.g. `YouTube Saver`) and click **Confirm**.
5. Copy the link to your database (from the share button or browser URL bar).

---

### 4. Configure the Extension

1. Click the **YouTube to Notion** extension icon in Chrome.
2. Go to the **⚙️ Settings** tab (or right-click the icon &rarr; **Options**):
   - Paste your **Gemini API Key**.
   - Paste your **Notion Internal Integration Token** (`secret_...`).
   - Paste your **Notion Database ID or URL**.
3. Click **🔗 Test Connection & Auto-Map Properties**.
   - The extension will verify credentials and automatically map your database properties.
4. Click **Save Settings**.

---

## 🎬 How to Use

1. Navigate to any YouTube video (e.g., `https://www.youtube.com/watch?v=...`).
2. Click the **YouTube to Notion** extension icon.
3. The video title, channel, thumbnail, and caption availability are instantly previewed.
4. Click **✨ Generate Summary with Gemini**.
5. Review or tweak the generated overview, bulleted takeaways, and tags in the popup.
6. Click **📥 Save to Notion**.
7. Click **Open in Notion ↗** to view your newly created, beautifully formatted Notion page!

---

## 📁 Project Structure

```
yt-to-notion-gemini/
├── manifest.json              # Manifest V3 configuration
├── background/
│   └── service-worker.js      # Background service worker
├── content/
│   ├── main-world.js          # Injected into YouTube page world for player access
│   └── content.js             # Content script for metadata & caption extraction
├── popup/
│   ├── popup.html             # Main popup interface
│   ├── popup.css              # Styling
│   └── popup.js               # UI logic, AI generation, and Notion saving
├── options/
│   ├── options.html           # Full-window options / settings page
│   ├── options.css            # Options styling
│   └── options.js             # Options logic & connection tester
├── utils/
│   ├── gemini.js              # Google Gemini API client
│   └── notion.js              # Notion REST API client & block builder
├── icons/
│   ├── icon-16.png            # 16x16 icon
│   ├── icon-48.png            # 48x48 icon
│   ├── icon-128.png           # 128x128 icon
│   └── generate-icons.py      # Icon generator script
└── README.md                  # Documentation
```
