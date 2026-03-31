# Game Request Generator 🕹️

A comprehensive **Turborepo Monorepo** desktop application for managing game progression tracking, automated request simulation, and daily task management. Built with **Tauri 2.0**, **React**, and **Rust** for a high-performance, native experience across Windows and Mobile.

---

## 🌟 Advanced Features

### 📅 Daily Task Management
- **Smart Batching**: Automatically groups accounts and generates task batches.
- **Progressive Indexing**: Tasks are indexed per account for clear tracking of progression.
- **Completion Tracking**: Real-time monitoring of completed vs. pending tasks.

### 📤 Telegram Synchronization & Automation
- **Database Backup/Restore**: Seamlessly sync your entire database through Telegram for easy migration or backup.
- **Auto-Reports**: Automated delivery of Excel progression reports directly to Telegram groups.
- **Smart Notifications**: Integrated alerts for system events and task completions.

### 🌐 Connectivity & Security
- **Proxy Management**: Built-in support for **HTTP** and **SOCKS5** proxies to route all request traffic safely.
- **Smart Expiry Alerts**: Automatically monitors proxy expiration dates and sends warning notifications to Telegram 24 hours before expiry.
- **Parsing Utilities**: Smart parsing of proxy links from Telegram bot messages.

### 🛠️ HTTP Repeater (Pro Toolbox)
- **Raw Request Simulation**: A powerful **Burp Suite-like Repeater** integrated into the app.
- **Manual Control**: Edit and replay raw HTTP/1.1 and HTTP/2 requests with custom headers and payloads.
- **Proxy Routing**: Simulated requests automatically respect your global proxy settings.

---

## 📁 Project Structure

The project is architected as a highly modular monorepo:

```
game-request-generator/
├── apps/
│   └── desktop-mobile/       # Main Tauri + React application
├── packages/
│   ├── grq-ui/               # UI Component library (Atomic Design)
│   ├── grq-core/             # Business logic, services, and utils
│   ├── grq-api-bindings/     # Shared types and API interfaces
│   └── config/               # Shared TypeScript and build configurations
├── crates/
│   └── grq-engine/           # Core Rust logic and database services
├── .github/workflows/        # CI/CD and Release automation
└── turbo.json                # Turborepo orchestration
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** (v18+)
- **Rust** (latest stable)
- **pnpm** (Workspace management)

### Installation
```bash
git clone <repository-url>
cd game-request-generator
pnpm install
```

### Development
```bash
pnpm start
```
*This launches the Tauri environment with hot-reloading for both Rust and React.*

---

## 📦 Releases (CI/CD)
The project utilizes an automated pipeline via GitHub Actions to build and distribute:
- **Windows**: `.msi`, `.exe`
- **Mobile**: `.apk` (Android)
- **Cross-Platform**: Linux (`.deb`) and macOS supported.

## 📄 License
This project is licensed under the MIT License.

---
**Built with ❤️ using Turborepo, Tauri, React, and Rust**
