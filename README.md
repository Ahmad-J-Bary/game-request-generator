# Game Request Generator 🕹️

A comprehensive **Turborepo Monorepo** desktop application for managing game progression tracking, automated request generation, and daily task management. Built with Tauri, React, and Rust for a native desktop and mobile-friendly experience.

## 🌟 Features

### 🎮 Game & Account Management
- **Multi-Game Support**: Manage multiple games with custom level tracking and purchase events.
- **Automated Task Generation**: Generates daily HTTP requests based on account progress.
- **Modern Responsive UI**: A premium, mobile-friendly interface with a dynamic sidebar and dark/light modes.
- **Multi-Language**: Full support for English and Arabic (العربية).

### 🚀 Technical Excellence
- **Monorepo Architecture**: Powered by **pnpm workspaces** and **Turborepo** for efficient builds and scaling.
- **Tauri 2.0**: Native performance with a Rust backend and a React/TypeScript frontend.
- **Automated CI/CD**: Seamless release workflow targeting Windows, macOS, Linux, and Android.

## 📁 Project Structure

This project is organized as a monorepo to separate concerns and maximize code reuse:

```
game-request-generator-APP/
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

## 🚀 Getting Started

### Prerequisites

- **Node.js** (v18+)
- **Rust** (latest stable)
- **pnpm** (Required for workspaces)

### Installation & Development

1. **Clone and Install:**
   ```bash
   git clone <repository-url>
   cd game-request-generator-APP
   pnpm install
   ```

2. **Start Development:**
   ```bash
   pnpm start
   ```
   *This runs the Tauri development environment (Vite + Rust).*

3. **Build for Production:**
   ```bash
   pnpm build
   ```

## 🛠️ Development Workflow

We use **pnpm** and **Turborepo** to manage the workflow across all packages:

- `pnpm dev`: Start the desktop application in dev mode.
- `pnpm build`: Build all packages and the main application.
- `pnpm lint`: Run linting across the entire workspace.
- `pnpm type-check`: Validate TypeScript types globally.

## 📱 Mobile & Responsiveness

The UI has been meticulously designed to be **mobile-first**:
- **Desktop**: A persistent sidebar with collapse/expand capabilities.
- **Mobile**: A sliding drawer navigation triggered by a top header hamburger menu.
- **Tables**: All data tables are optimized for both horizontal and vertical viewing.

## 📦 Releases (CI/CD)

The project includes an automated release workflow in `.github/workflows/release.yml`:
1. Push a tag (e.g., `v1.0.6`).
2. GitHub Actions will build binaries for:
   - **Windows** (.msi, .exe)
   - **macOS** (.dmg, .app)
   - **Linux** (.deb, .AppImage)
   - **Android** (.apk)
3. Artifacts are automatically uploaded to a GitHub Release draft.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Built with ❤️ using Turborepo, Tauri, React, and Rust**