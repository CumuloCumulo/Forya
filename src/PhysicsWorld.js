import * as CANNON from 'cannon-es';

export class PhysicsWorld {
  constructor() {
    // 创建物理世界
    this.world = new CANNON.World();
    
    // 启用重力，因为现在有高度差了
    this.world.gravity.set(0, -30, 0); // 增加重力感
    
    // 使用 SAPBroadphase (适合大量物体)
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    
    // 默认接触材质
    // 玩家和地面的摩擦力要足够，否则会滑下山
    const defaultMaterial = new CANNON.Material('default');
    const defaultContactMaterial = new CANNON.ContactMaterial(
      defaultMaterial,
      defaultMaterial,
      {
        friction: 0.3, // 增加摩擦力防止滑坡
        restitution: 0.0 // 无弹性
      }
    );
    this.world.addContactMaterial(defaultContactMaterial);
    this.world.defaultContactMaterial = defaultContactMaterial;
    
    // 存储所有物理体
    this.bodies = [];
  }
  
  /**
   * 添加玩家物理体
   */
  addPlayerBody(position, radius) {
    // 使用球体代替圆柱体，在不平整地面移动更顺滑
    // 或者使用胶囊体（Cannon需要组合形状，这里简化用球体）
    const shape = new CANNON.Sphere(radius);
    
    const body = new CANNON.Body({
      mass: 60, // 增加质量
      shape: shape,
      position: new CANNON.Vec3(position.x, position.y + 2, position.z),
      linearDamping: 0.1, // 降低阻尼，让手动控制更灵敏
      angularDamping: 0.99, // 防止球体乱滚
      fixedRotation: true, // 锁定旋转
      type: CANNON.Body.DYNAMIC
    });
    
    this.world.addBody(body);
    this.bodies.push(body);
    return body;
  }
  
  /**
   * 移除物理体
   */
  removeBody(body) {
    this.world.removeBody(body);
    const index = this.bodies.indexOf(body);
    if (index > -1) {
      this.bodies.splice(index, 1);
    }
  }
  
  /**
   * 直接添加 Cannon Body (用于 TerrainChunk)
   */
  addBody(body) {
    this.world.addBody(body);
    this.bodies.push(body);
  }

  /**
   * 更新物理世界
   */
  update(deltaTime) {
    const fixedTimeStep = 1 / 60;
    const maxSubSteps = 5; // 增加子步数以提高稳定性
    const clampedDelta = Math.min(deltaTime, 0.1);
    
    this.world.step(fixedTimeStep, clampedDelta, maxSubSteps);
    
    // 不再强制 Y 轴，让物理引擎处理重力和碰撞
  }
}
