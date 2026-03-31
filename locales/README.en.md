# 🕹️ **Game Request Generator**
> _A comprehensive desktop application for game progression tracking, network request simulation, and professional daily task management. Built with Tauri, React, and Rust._

<div align="center">
  <img src="https://img.shields.io/badge/Language-English-blue?style=flat-square" alt="English">
  <a href="#">English Version</a> |
  <img src="https://img.shields.io/badge/Language-Arabic-green?style=flat-square" alt="Arabic">
  <a href="../README.md">Arabic Version</a>
</div>

---

## 📖 **Overview**
> _This project aims to simplify the game progression tracking process through a modern UI and powerful analytical tools. The application supports managing thousands of accounts with advanced automation features and Telegram synchronization for maximum efficiency and security._

---

## 📋 **Table of Contents** <a id="toc"></a>
1. [✨ Key Features](#features)
2. [💻 Tech Stack](#tech-stack)
3. [🚀 Getting Started](#getting-started)
4. [📤 Telegram Sync & Automation](#telegram-sync)
5. [📊 Advanced Excel Reports](#excel-reports)
6. [🛠️ HTTP Repeater (Pro Toolbox)](#http-repeater)
7. [📁 Project Structure](#project-structure)
8. [🖼️ Visual Tour](#visual-tour)
9. [📜 License](#license)

---

## ✨ **Key Features** <a id="features"></a>
- **📅 Smart Task Management**: Automatic daily task distribution based on grouping algorithms to ensure account coverage.
- **🔗 Burp Suite Simulator**: Integrated Repeater tool for manually editing and resending HTTP requests for fast analysis.
- **🌐 Intelligent Proxy System**: Full support for HTTP/SOCKS5 proxies with automatic validity detection.
- **🚀 Premium UI**: Modern design supporting multiple themes and both Arabic and English with full responsiveness.

<div align="center">
  <a href="#toc">🔝 Back to Top</a>
</div>

---

## 💻 **Tech Stack** <a id="tech-stack"></a>
- **Tauri 2.0**: For building the desktop application core using Rust.
- **React & TypeScript**: To develop the modern and interactive user interface.
- **Rust Engine**: For heavy task processing and high-performance database management.
- **pnpm Workspaces**: For efficiently managing the Monorepo package structure.

<div align="center">
  <a href="#toc">🔝 Back to Top</a>
</div>

---

## 🚀 **Getting Started** <a id="getting-started"></a>

### Prerequisites
- [x] **Node.js (v18+)**
- [x] **Rust (Stable)**
- [x] **pnpm** (Installed globally)

### Installation Steps
1. Clone the repository:
   ```bash
   git clone https://github.com/Ahmad-J-Bary/game-request-generator.git
   cd game-request-generator
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Start development mode:
   ```bash
   pnpm start
   ```

<div align="center">
  <a href="#toc">🔝 Back to Top</a>
</div>

---

## 📤 **Telegram Sync & Automation** <a id="telegram-sync"></a>
- **Cloud Backup**: Upload and download your entire database with a single click.
- **Completion Reports**: Automatically send generated Excel reports to designated Telegram groups.
- **Notifications**: Receive instant alerts for task completions or proxy connection issues.

<p align="center">
  <img src="screenshots/telegram-sync.en.png" width="850" alt="Telegram Sync">
  <br>
  <em>Telegram Sync interface and cloud backup management</em>
</p>

<div align="center">
  <a href="#toc">🔝 Back to Top</a>
</div>

---

## 📊 **Advanced Excel Reports** <a id="excel-reports"></a>
- **Workflow Automation**: Seamless integration with Telegram to automatically send report files to groups immediately after daily tasks.
- **Tracking Efficiency**: "Clean Data" reports designed for direct sharing with teams to ensure precise and rapid progress monitoring.
- **Mass Account Management**: Comprehensive summaries for all active accounts with a single click, minimizing the need for manual oversight.

<p align="center">
  <img src="screenshots/excel-reports.en.png" width="850" alt="Excel Reports">
  <br>
  <em>Sample Advanced Excel Reports for tracking game progression</em>
</p>

<div align="center">
  <a href="#toc">🔝 Back to Top</a>
</div>

---

## 🛠️ **HTTP Repeater (Pro Toolbox)** <a id="http-repeater"></a>
- **Full Control**: Precisely edit headers and payloads with professional ease.
- **Protocol Support**: Fully compatible with both HTTP/1.1 and HTTP/2.
- **Proxy Aware**: All requests sent through the Repeater automatically respect global proxy settings.

<p align="center">
  <img src="screenshots/http-repeater.en.png" width="850" alt="HTTP Repeater">
  <br>
  <em>Advanced HTTP Repeater interface for network request analysis</em>
</p>

<div align="center">
  <a href="#toc">🔝 Back to Top</a>
</div>

---

## 📁 **Project Structure** <a id="project-structure"></a>
 ```bash
 game-request-generator/
 ├── apps/
 │   └── desktop-mobile/           # Main Application (Tauri + Vite + React)
 │       ├── src/                  # Frontend UI files (React UI)
 │       │   ├── pages/            # Core feature dashboards and views
 │       │   │   ├── Dashboard/    # Main statistics and overview
 │       │   │   ├── Accounts/     # Account and group management
 │       │   │   ├── DailyTasks/   # Automation and task scheduling
 │       │   │   └── Settings/     # Global system and API settings
 │       │   └── assets/           # Static media, icons, and templates
 │       └── src-tauri/            # Backend Bridge (Rust System)
 │           └── src/lib.rs        # Tauri commands and core system bindings
 ├── packages/
 │   ├── grq-ui/ (Atomic Design)   # Centralized UI Component Library
 │   │   ├── atoms/ molecules/ organisms/ templates/
 │   ├── grq-core/                 # Core business logic and shared services
 │   │   └── src/
 │   │       ├── services/         # (TauriService, ExcelService, ApiService, etc)
 │   │       ├── hooks/            # Frontend Custom Hooks
 │   │       ├── contexts/         # Application State Management
 │   │       └── utils/            # Shared utilities (TaskGenerator, Validation, etc)
 │   └── grq-api-bindings/         # Shared communication types and interfaces
 ├── crates/
 │   └── grq-engine/               # High-performance Rust Engine (Deep Core)
 │       └── src/
 │           ├── db/               # Database management (SQLite/Diesel)
 │           ├── models/           # Core Rust data models and entities
 │           └── services/         # Heavy-lifting technical operations
 └── locales/                      # Documentation and localization resources
 ```

<div align="center">
  <a href="#toc">🔝 Back to Top</a>
</div>

---

## 🖼️ **Visual Tour** <a id="visual-tour"></a>

<p align="center">
  <img src="screenshots/dashboard.en.png" width="850" alt="Dashboard">
  <br>
  <em>Overview of the main Dashboard and core user interface</em>
</p>

<div align="center">
  <a href="#toc">🔝 Back to Top</a>
</div>

---

## 📜 **License** <a id="license"></a>
This project is licensed under the MIT License. See the `LICENSE` file for details.

<div align="center">
  <a href="#toc">🔝 Back to Top</a>
</div>

<p align="center"> Developed with ❤️ by <a href="https://github.com/Ahmad-J-Bary">@Ahmad Abdelbary</a> </p>
