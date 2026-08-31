# FORYA 山体接触：擦坡脱离

## 现象与原因

玩家使用球形刚体，地形使用 cannon-es `Heightfield`。物理引擎正确阻止球体穿过山体，但飞行控制器每帧继续把水平速度拉向玩家朝向。当朝向指向斜坡内部时，推进与非穿透约束持续对抗，产生“粘在山上”的观感。

## 原型处理

- 保留山体碰撞，不允许穿模。
- 只在人物距地形小于 `2.2 m`、坡面较陡（法线 Y 分量小于 `0.82`）且速度确实指向山体内部时触发。
- 人物高于近地阈值时不采样坡面法线，常规飞行帧不增加额外地形查询。
- 利用高度场中心差分估算局部法线。
- 去掉指向坡内的速度分量，保留 `94%` 切向速度，再沿法线增加有上限的脱离速度。
- 加入 `0.32 m` 的小型分离偏置，避免下一个固定物理步再次进入同一接触面。
- 缓坡、离地飞行和正在远离山体的状态不受影响。

## 资料依据

- [cannon-es Getting Started](https://github.com/pmndrs/cannon-es/blob/master/getting-started.md) 列出 `Sphere` 与 `Heightfield` 为支持的碰撞对；因此不需要删除现有地形物理。
- [cannon-es ContactEquation](https://pmndrs.github.io/cannon-es/docs/classes/ContactEquation.html) 将 `ni` 定义为接触法线，并将接触建模为非穿透约束。本轮使用相同的法线/切向分解思路处理飞行控制速度。
- [cannon-es ContactMaterial](https://pmndrs.github.io/cannon-es/docs/classes/ContactMaterial.html) 说明摩擦和恢复系数只控制接触材料反应。单纯调低摩擦不会停止飞行控制器在下一帧重新将速度指向山体，所以修复放在控制后的速度响应层。

## 低资源验证

- 纯数学测试验证陡坡入射速度会变为沿坡滑移且带有外离分量。
- 纯数学测试验证缓坡和离地状态不会被修改。
- 不使用 SwiftShader 或长时间自动飞行。
