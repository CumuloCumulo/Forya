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

确保已安装 [Node.js](https://nodejs.org/)，然后在项目根目录执行：

```bash
npm install
npm run dev
```

启动后在浏览器中访问终端显示的地址（通常是 `http://localhost:5173`）。

## 📂 项目结构

```text
Forya/
├── index.html          # 游戏入口与 UI
├── bgm.mp3             # 背景音乐
├── package.json        # 项目配置与依赖
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
*   **Cannon.js (cannon-es)**: 物理引擎
*   **Vite**: 构建与开发服务器
*   **HTML5 / CSS3**: 游戏界面 (UI)
*   **JavaScript (ES6+)**: 核心逻辑实现

