# FORYA 品质升级路线

## 产品方向

目标不是复制《极限国度》的资产，而是建立同等级的体验支柱：可信且可玩的山地、清晰的极限运动轮廓、速度感强的三人称镜头、路线驱动的开放探索，以及在浏览器预算内稳定运行的渲染管线。

Ubisoft 对《极限国度》的公开复盘强调了三点：先建立宏观地貌，再为玩法强化真实地形；道路和线路必须根据坡度、弯角与趣味性反复筛选；世界、角色、镜头和操控需要共同迭代。这些原则会作为 FORYA 的长期验收依据。

## 当前里程碑：翼装垂直切片 0.2

- [x] 升级到 Three.js 0.183 与当前 Vite，统一运行库和类型版本。
- [x] 修复密度场等值面产生的反向/缺失三角；对当前单值密度函数改用等价的连续表面采样，保留 Marching Tetrahedra 供未来洞穴与悬垂使用。
- [x] 修复跨区块装饰的非确定性和 LOD 只降不升问题。
- [x] 按 `generate-interactive-web3d` skill 的身份特征与语义部件流程，将卡通小鸟替换为程序化翼装运动员；角色具有正确的轴向人体比例、分层关节、背部飞行包、手臂翼膜、腿间翼和速度尾迹。
- [x] 保留原作的大世界自由飞行：玩家可持续主动爬升、主动加速或松开按键浅滑翔；航标只是相隔数百米的可选探索目标。
- [x] 加入动态 FOV、转向侧倾、速度抖动、地形避让和首帧镜头同步。
- [x] 加入 8 门训练线路、路线进度、距离、速度、海拔和肾上腺素 HUD。
- [x] 加入程序化天空、太阳、大气雾、动态山地主菜单和稳定的 ACES/sRGB 输出。
- [x] 加入程序化三平面岩石/草地/积雪 PBR 混合与动态海面，替代塑料感纯顶点色。
- [x] 将两层圆锥树替换为确定性实例化针叶树：树干、下层枝冠、中层枝冠与顶冠拥有独立尺度和色差，并受坡度与雪线约束；多面体云替换为柔边大气云。
- [x] 建立双层地形流送：玩家周围约 480 米使用带碰撞和植被的多级细节区块，外围使用覆盖约 3.2 公里的连续低精度地形；远景底层同时遮住详细区块生成期间的临时空洞，并随玩家分段重定位。
- [x] 将近景几何、法线、物理高度场与远景地形采样迁移到 1–3 个 Web Worker；主线程只装配 Three.js/Cannon 对象，并按玩家距离优先调度，保留无 Worker 环境的确定性降级路径。
- [x] 为三档近景 LOD 加入按精度递增的下沉裙边，遮蔽不同采样密度产生的 T 形裂缝；远景底层继续承担区块尚未装配时的无缝兜底。

## 下一里程碑：环境与角色资产 0.3

1. 地表材质
   - 用三平面投射替代纯顶点色，混合岩石、草地、雪、泥土四套 PBR 表面。
   - 用坡度、海拔、湿度、曲率控制材质权重；加入岩层方向和近景微法线。
   - 在现有 skirt 基础上加入 geomorph，继续记录并压低装饰物装配造成的主线程尖峰。

2. 角色资产
   - 建立 Blender → glTF 2.0 → Draco/Meshopt/KTX2 管线。
   - 制作绑定后的翼装运动员、布料法线和 6 个核心动作：待机、俯冲、滑翔、拉升、左右压翼。
   - 用 AnimationMixer 做状态混合，保留当前程序化角色作为无资产降级版本。

3. 世界可读性
   - 以山脊、峡谷、冰川、针叶林和高山草甸形成可辨识的地貌区域。
   - 让线路沿地形生成并以坡度、净空、曲率、风险和景观构图评分，而不是固定坐标串联。
   - 加入路径、旗帜、风袋、岩壁标线和远景兴趣点，减少漂浮圆环依赖。

4. 画面与性能
   - 加入轻量级 SMAA、色彩分级、速度暗角和选择性 Bloom；避免大面积泛光。
   - 以 1440×900、DPR 1.5 为桌面基准：目标 60 FPS、P95 帧时低于 20 ms、常态 draw calls 少于 350。
   - 建立低/中/高三级配置，并记录三角形、draw calls、纹理和区块生成耗时。

## 后续里程碑

- 0.4：山地自行车运动模型、车架悬挂、轮胎接地、样板下坡赛道。
- 0.5：滑雪/单板、雪面反馈、雪痕与粉雪粒子。
- 0.6：开放世界活动、重生/回溯、计时、评分、幽灵玩家与手柄支持。
- 0.7：音频分层、环境混响、风速反馈、可访问性与移动端自适应。

## 参考资料

- [Ubisoft：The Wild World of Riders Republic](https://news.ubisoft.com/en-us/article/38It3kpo4GJgTLP6S3SdNA/the-wild-world-of-riders-republic)
- [Ubisoft：Using Algorithms To Create Riders Republic’s Trail Network](https://news.ubisoft.com/en-gb/article/7Jdttfpxq3rykQWpGsVFDa/using-algorithms-to-create-riders-republics-trail-network)
- [Ubisoft：Riders Republic — Inspired by Nature](https://www.ubisoft.com/en-us/studio/annecy/news/FPkXoVl2s6FZknSYgu6xu/riders-republic-inspired-by-nature-premieres-exclusively-on-gtv-this-week)
- [Three.js：WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html)
- [Three.js：Color Management](https://threejs.org/manual/en/color-management.html)
- [three-landscape：triplanar 与 splat-map 实现参考](https://github.com/nwpointer/three-landscape)
