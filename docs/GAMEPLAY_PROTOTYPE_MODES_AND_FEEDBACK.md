# FORYA 玩法原型：双模式与行动反馈

## 阶段目标

本轮以已上线提交 `6ff73c7` 为地图基线，不修改地形。目标不是用分数或更多 HUD 宣称游戏有深度，而是验证玩家动作能否得到清晰、令人愉悦的视听反馈。

## 两种模式

### 无尽航标续航

- HUD 进度从 `00 / ∞` 开始，修复原先初始显示 `01` 的问题。
- 航标以固定种子持续向前生成，始终只保留 5 个、显示最近 3 个，不会随游玩时间无限占用场景对象。
- 相邻航标距离限制为 `300–420 m`，单次转向不超过约 `10.3°`；生成时对两环之间的地形做 18 点视线采样，必要时抬高下一环。
- 第二环使用较弱的不透明度并关闭深度测试，作为树木、局部细节或采样间隙遮挡时的可见性兜底；当前可通过环仍保留正常深度感。
- Space 主动上升消耗独立的 `FLIGHT ENERGY`；能量不会被动恢复。
- 穿过当前航标恢复全部上升能量并生成更远的新航标。
- Shift 加速是可随时执行的动作，不再消耗或显示“肾上腺素”数值；高速状态由姿态、镜头、尾迹和屏幕气流表达。

### 自由飞行

- 不创建航标，隐藏航标目标和飞行能量 HUD。
- Space 可无限上升；玩家只根据地形、速度和反馈选择路线。

## 行动反馈

### 高速气流

- 从 `112 km/h` 开始在屏幕边缘渐入放射状气流线，约 `205 km/h` 达到完整强度。
- 气流线由 28 条增加到 44 条，同时增加长度、亮度和边缘覆盖；中心视野仍保持干净，不遮挡飞行路线。
- 低速时动画暂停，而不是仅设为透明，避免无意义的持续动画开销。

### 低空掠水

- 水面固定高度沿用现有 `-8 m`，不修改水体或地形。
- 只有当地形低于水面、玩家位于水面上方约 2–11 米且速度超过约 `95 km/h` 时触发。
- 世界反馈由双条水面尾流、固定 72 粒子的循环水雾池和轻量屏幕下缘水光组成。
- 真正触到水面时会产生一次强化水雾、削减部分水平速度并向上弹开，避免玩家无反馈地穿入水下。
- 粒子池复用 typed arrays，不在稳定帧创建新 Three.js 对象；升高、减速或离开水面后自然衰减。

## 设计依据

- [Ubisoft：Riders Republic](https://www.ubisoft.com/en-gb/game/riders-republic)将高速低空 proximity wingsuit 作为飞行体验本身，而不仅是计分规则。
- [Ubisoft：The Wild World of Riders Republic](https://news.ubisoft.com/en-ca/article/38It3kpo4GJgTLP6S3SdNA/the-wild-world-of-riders-republic)强调环境与 camera、character、controls 共同迭代；本轮因此让速度和水面直接响应玩家，而不是继续精修静态地图。
- [Ubisoft：Steep — Action Sports Go Open World](https://news.ubisoft.com/en-us/article/7jAdiKBdiUehSiZK3OWO2Z/steep-action-sports-go-open-world)同时保留开放探索与明确挑战，支持自由模式和航标模式并存。
- [Three.js Points](https://threejs.org/docs/pages/Points.html)、[BufferAttribute](https://threejs.org/docs/pages/BufferAttribute.html)与[DynamicDrawUsage](https://threejs.org/docs/pages/BufferAttributeUsage.html)用于固定粒子池和动态位置/颜色更新。
- [Three.js Frustum](https://threejs.org/docs/pages/Frustum.html) 和 [Perspective Camera 手册](https://threejs.org/manual/en/cameras.html)说明视锥由 FOV、aspect、near/far 构成；“已生成”并不代表玩家当前视野可见。
- [Track-Generator](https://github.com/ChickenKorma/Track-Generator) 在程序化赛道中会二次拉开过近的点并避免过急转角；本项目对空中航标采用同类的间距/转角硬约束。
- [Yacht Club Games：Check Point Design](https://www.yachtclubgames.com/blog/check-point-design/) 记录了“设计者能看到、玩家却看不到”的航标可见性问题；因此本轮将可见性写入生成约束而非只增加 HUD 文字。
- [MDN：CSS 性能优化](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Performance/CSS)建议优先动画 `transform` 和 `opacity`；增强气流仍只修改这两类属性，不增加 WebGL 场景负担。

## 原型验证问题

不先看留存或分数，只观察行为：

1. 玩家是否能不看说明就分辨普通飞行与高速飞行？
2. 看到水面后，玩家是否会主动降低高度尝试触发尾流？
3. 航标模式中，玩家是否会为下一次爬升主动穿过航标？
4. 能量不足时，玩家是否自然改为滑翔寻找航标，而不是认为 Space 失灵？
5. 自由模式是否明确表现为无航标、无限上升，而非“航标加载失败”？

若答案是否定的，下一轮优先调整动作反馈和模式说明，不扩建地图，也不加入分数系统。

## 低资源验证

- `tests/flight-modes.test.ts` 只验证能量和无尽路线的纯逻辑，不启动浏览器。
- 默认只运行 Node 测试与生产构建。
- 视觉验收留给用户本地真实 GPU；除非用户明确允许，不使用 SwiftShader 或长时间自动飞行。
