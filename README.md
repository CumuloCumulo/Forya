# 🏔️ 极限国度 (Extreme World)

探索无尽的山脉与云海，体验自由飞行的乐趣。这是一个基于 Three.js 开发的 3D 开放世界探索游戏。

## 🎮 游戏特色

*   **无限地形**：基于噪声算法（Noise）自动生成的无尽山脉地形。
*   **沉浸氛围**：精心调配的黄昏光照、体积雾效与电影级色调映射。
*   **自由探索**：支持地面第三人称移动与空中自由飞行/滑翔。
*   **物理系统**：包含重力、碰撞检测的自定义物理模拟。
*   **听觉体验**：包含自动循环播放的背景音乐，增强沉浸感。

## 🕹️ 操作指南

| 按键 | 功能 |
| --- | --- |
| **W / A / S / D** | 前后左右移动 |
| **Shift** | 加速 / 冲刺 |
| **Space (空格)** | **飞行 / 滑翔** (按住上升) |
| **鼠标移动** | 控制视角方向 |
| **鼠标左键** | 点击画面以锁定指针 |

## 🚀 如何运行

由于项目使用了 ES Modules (`import/export`)，**不能直接双击 `index.html` 打开**，必须通过本地服务器运行。

### 方法 1: 使用 VS Code Live Server (推荐)
1. 在 VS Code 中安装 **Live Server** 扩展。
2. 右键点击项目根目录下的 `index.html`。
3. 选择 **"Open with Live Server"**。

### 方法 2: 使用 Python
如果你的电脑安装了 Python：
1. 在项目根目录打开终端。
2. 运行命令：
   ```bash
   python -m http.server
   ```
3. 在浏览器访问显示的地址 (通常是 `http://localhost:8000`)。

### 方法 3: 使用 Node.js
如果你安装了 Node.js：
1. 在项目根目录运行：
   ```bash
   npx http-server .
   ```

## 📂 项目结构

```text
game_practice/
├── index.html          # 游戏入口与 UI
├── bgm.mp3             # 背景音乐
├── styles/
│   └── main.css        # 界面样式
└── src/
    ├── main.js         # 入口脚本，处理 UI 和初始化
    ├── Game.js         # 游戏核心类，管理场景、渲染循环
    ├── Player.js       # 玩家控制与逻辑
    ├── CameraManager.js # 第三人称相机控制
    ├── PhysicsWorld.js # 物理碰撞系统
    ├── world/          # 地形系统
    │   ├── WorldManager.js # 无限地图管理
    │   └── TerrainChunk.js # 单个地形块生成
    └── utils/
        └── Noise.js    # 噪声生成算法
```

## 🛠️ 技术栈

*   **Three.js**: 3D 渲染引擎
*   **HTML5 / CSS3**: 游戏界面 (UI)
*   **JavaScript (ES6+)**: 核心逻辑实现

