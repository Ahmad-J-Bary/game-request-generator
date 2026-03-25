# Game Request Generator 🕹️

A comprehensive desktop application for managing game progression tracking, automated request generation, and daily task management. Built with Tauri, React, and Rust for a native desktop experience.

## 🌟 Features

### 🎮 Game Management
- **Multi-Game Support**: Manage multiple games simultaneously
- **Level Tracking**: Define game levels with custom event tokens, time spent, and bonus levels
- **Purchase Events**: Configure in-game purchase events with scheduling
- **Progress Monitoring**: Track completion status for levels and purchases

### 👥 Account Management
- **Multiple Accounts**: Support for multiple accounts per game
- **Custom Request Templates**: Import and manage HTTP request templates for each account
- **Progress Synchronization**: Track individual account progress across all game events

### 📋 Daily Task Automation
- **Automated Task Generation**: Generate daily tasks based on account progress and game configuration
- **HTTP Request Generation**: Automatically create session and event requests with proper timing
- **Task Completion Tracking**: Mark tasks as completed and track progress
- **Deferred Tasks**: Handle tasks that aren't ready for execution

### 📊 Data Import & Export
- **Excel Import**: Import game data from Excel files (.xlsx, .xls)
- **Template Import**: Bulk import request templates from text files
- **Flexible Data Structure**: Support for levels, purchase events, and accounts

### 🎨 User Experience
- **Modern UI**: Clean, responsive interface built with React and Tailwind CSS
- **Dark/Light Themes**: Toggle between themes for comfortable viewing
- **Multi-Language**: Support for English and Arabic (العربية)
- **Real-time Updates**: Live progress tracking and task status updates

## 🚀 Getting Started

### Prerequisites

- **Node.js** (v18 or higher)
- **Rust** (latest stable version)
- **pnpm** (recommended) or npm/yarn

### Installation

#### Option 1: From Source Code

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd game-request-generator
   ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

3. **Run in development mode:**
   ```bash
   pnpm run tauri dev
   ```

4. **Build for production:**
   ```bash
   pnpm run tauri build
   ```

#### Option 2: Pre-built Desktop Application

1. **Download the installer** for your platform:
   - **Linux**: `.deb` or `.AppImage` file
   - **Windows**: `.msi` or `.exe` installer
   - **macOS**: `.dmg` or `.app` bundle

2. **Install and run** the application

### 📁 Project Structure

```
game-request-generator/
├── src/                          # Frontend React application
│   ├── components/               # Reusable UI components
│   ├── contexts/                 # React contexts for state management
│   ├── hooks/                    # Custom React hooks
│   ├── locales/                  # Translation files
│   ├── pages/                    # Application pages/routes
│   ├── services/                 # API and utility services
│   ├── types/                    # TypeScript type definitions
│   └── utils/                    # Utility functions
├── src-tauri/                    # Backend Rust application
│   ├── src/
│   │   ├── db/                   # Database initialization
│   │   ├── models/               # Data models and structs
│   │   ├── services/             # Business logic services
│   │   └── main.rs               # Application entry point
│   ├── Cargo.toml                # Rust dependencies
│   └── tauri.conf.json           # Tauri configuration
├── public/                       # Static assets
└── dist/                         # Built frontend (generated)
```

## 📖 Usage Guide

### 1. Setting Up Games

1. Navigate to **Games** section
2. Click **"Add Game"** to create a new game
3. Configure game details and save

### 2. Adding Levels

1. Go to **Levels** page
2. Select a game from the dropdown
3. Add levels with:
   - **Event Token**: Unique identifier for the level
   - **Level Name**: Display name
   - **Days Offset**: When this level should be reached
   - **Time Spent**: Base time in seconds
   - **Bonus**: Whether this is a bonus level

### 3. Configuring Purchase Events

1. Visit **Purchase Events** page
2. Create purchase events with:
   - **Event Token**: Unique purchase identifier
   - **Restricted**: Access restrictions
   - **Max Days Offset**: Latest possible day

### 4. Managing Accounts

1. Go to **Accounts** section
2. Click **"Add Account"**
3. Configure:
   - **Account Name**: Display identifier
   - **Start Date**: When the account began playing
   - **Start Time**: Account creation time
   - **Request Template**: HTTP request format

### 5. Importing Data

#### Excel Import
- Supports `.xlsx` and `.xls` files
- Required sheets: `Levels`, `Purchase Events`, `Accounts`
- Click **"Import"** → **"Import from Excel"**

#### Template Import
- Select multiple `.txt` files containing HTTP request templates
- Files are matched to accounts by filename
- Click **"Import"** → **"Import Request Templates"**

### 6. Daily Task Management

1. Navigate to **Daily Tasks**
2. The system automatically generates tasks for today
3. Tasks are organized in batches by readiness
4. **Ready Tasks**: Can be executed immediately
5. **Deferred Tasks**: Waiting for previous tasks to complete

#### Completing Tasks
- Click **"Complete"** on each task
- The system sends HTTP requests and marks progress
- Tasks move from "Ready" to "Completed"

## 🛠️ Technical Architecture

### Frontend (React/TypeScript)
- **Framework**: React 19 with TypeScript
- **UI Library**: Radix UI + Tailwind CSS
- **State Management**: React Context + TanStack Query
- **Routing**: React Router DOM
- **Internationalization**: react-i18next
- **Theme**: next-themes with custom CSS variables

### Backend (Rust/Tauri)
- **Framework**: Tauri 2.0 for desktop app development
- **Database**: SQLite with Rusqlite
- **HTTP Client**: Built-in Tauri HTTP capabilities
- **File System**: Tauri FS plugin for file operations
- **Dialogs**: Tauri Dialog plugin for file selection

### Database Schema

#### Games Table
```sql
- id: INTEGER PRIMARY KEY
- name: TEXT NOT NULL
- created_at: TEXT
```

#### Levels Table
```sql
- id: INTEGER PRIMARY KEY
- game_id: INTEGER (FOREIGN KEY)
- level_name: TEXT
- event_token: TEXT
- days_offset: INTEGER
- time_spent: INTEGER
- is_bonus: BOOLEAN
```

#### Accounts Table
```sql
- id: INTEGER PRIMARY KEY
- game_id: INTEGER (FOREIGN KEY)
- name: TEXT
- start_date: TEXT
- start_time: TEXT
- request_template: TEXT
```

#### Progress Tables
- `account_level_progress`: Tracks level completion
- `account_purchase_event_progress`: Tracks purchase completion

## 🔧 Development

### Available Scripts

```bash
# Development
pnpm dev              # Start frontend dev server
pnpm run tauri dev    # Start Tauri dev environment

# Building
pnpm build            # Build frontend for production
pnpm run tauri build  # Build desktop application

# Code Quality
pnpm lint             # Run ESLint
pnpm type-check       # Run TypeScript checks
```

### Development Setup

1. **Install Rust**: Follow [official Rust installation guide](https://rustup.rs/)
2. **Install Tauri CLI**: `cargo install tauri-cli`
3. **Install Node.js dependencies**: `pnpm install`
4. **Start development**: `pnpm run tauri dev`

## 📋 API Reference

### Tauri Commands

#### Game Management
- `add_game(name: string)` → `Game`
- `get_games()` → `Game[]`
- `update_game(id: number, name?: string)` → `boolean`

#### Account Management
- `add_account(request: CreateAccountRequest)` → `number`
- `get_accounts(game_id: number)` → `Account[]`
- `update_account(request: UpdateAccountRequest)` → `boolean`

#### Level Management
- `add_level(request: CreateLevelRequest)` → `number`
- `get_game_levels(game_id: number)` → `Level[]`
- `update_level(request: UpdateLevelRequest)` → `boolean`

#### Progress Tracking
- `get_daily_requests(account_id: number, target_date: string)` → `DailyRequest[]`
- `create_level_progress(request: CreateAccountLevelProgressRequest)` → `void`
- `update_level_progress(request: UpdateAccountLevelProgressRequest)` → `boolean`

## 🌍 Internationalization

The application supports multiple languages:
- **English** (en)
- **Arabic** (ar) - العربية

Language files are located in `src/locales/` and can be extended for additional languages.

## 🎨 Themes

### Light Theme
Clean, bright interface optimized for daytime use

### Dark Theme
Easy on the eyes, perfect for extended use and low-light environments

## 📊 Data Management

### Import Formats

#### Excel Format
**Levels Sheet:**
| Event Token | Level Name | Days Offset | Time Spent | Bonus |
|-------------|------------|-------------|------------|-------|
| level_001   | Level 1    | 0           | 1000       | false |

**Purchase Events Sheet:**
| Event Token | Restricted | Max Days Offset |
|-------------|------------|-----------------|
| purchase_001| false      | 30             |

**Accounts Sheet:**
| Account | Start Date | Start Time | Request Template |
|---------|------------|------------|------------------|
| account1| 2024-01-01 | 09:00      | HTTP template... |

#### Request Template Format
Text files containing HTTP request templates with placeholders:
```
POST /session HTTP/1.1
Host: game-server.com
Content-Type: application/json
Authorization: Bearer {auth_token}

{
  "event_token": "{event_token}",
  "time_spent": {time_spent},
  "account": "{account_name}"
}
```

## 🐛 Troubleshooting

### Common Issues

1. **Application won't start**
   - Ensure all dependencies are installed
   - Check that ports 1420 (dev) are available

2. **Database errors**
   - Application creates SQLite database automatically
   - Located at: `~/.local/share/com.dell.game-request-generator/`

3. **Import failures**
   - Verify Excel file format matches specifications
   - Check file permissions for template imports

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Tauri**: For the amazing desktop app framework
- **React**: For the robust frontend framework
- **Tailwind CSS**: For the utility-first CSS framework
- **Radix UI**: For accessible, customizable components
- **SQLite**: For reliable, embedded database storage

---

**Built with ❤️ using Tauri, React, and Rust**