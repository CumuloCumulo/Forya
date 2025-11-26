import * as THREE from 'three';

export class Player {
  constructor(scene, physics) {
    this.scene = scene;
    this.physics = physics;
    
    // 移动参数
    this.speed = 30;       // 基础移动速度提升
    this.sprintSpeed = 80; // 冲刺速度大幅提升
    this.flySpeed = 15;    // 上升速度稍微减慢，增加重量感
    this.glideSpeed = 100;  // 新增：滑翔极速
    this.currentSpeed = this.speed;
    
    this.radius = 0.4; // 物理半径
    
    // 状态
    this.isSprinting = false;
    this.isFlying = false;
    this.isMoving = false;
    this.targetRotation = 0;
    
    // 动画状态
    this.wingAngle = 0;
    this.flapSpeed = 0;
    
    // 创建模型
    this.createMesh();
    
    // 创建物理体 (球体)
    this.body = physics.addPlayerBody({ x: 0, y: 10, z: 0 }, this.radius);
  }
  
  createMesh() {
    this.mesh = new THREE.Group();
    
    const colors = {
      primary: 0x29b6f6,    // 天蓝色羽毛
      secondary: 0x0277bd,  // 深蓝翼尖
      belly: 0xe1f5fe,      // 白肚皮
      beak: 0xffca28,       // 金色喙
      crest: 0xffffff       // 白色冠羽
    };
    
    // 1. 身体 (水滴形)
    const bodyGeo = new THREE.SphereGeometry(0.4, 12, 12);
    bodyGeo.scale(0.8, 0.9, 1.4); 
    const bodyMat = new THREE.MeshStandardMaterial({ 
      color: colors.primary, 
      roughness: 0.7,
      flatShading: true 
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.5;
    body.castShadow = true;
    this.mesh.add(body);
    
    // 肚皮 (稍微亮一点)
    const bellyGeo = new THREE.SphereGeometry(0.36, 10, 10);
    bellyGeo.scale(0.8, 0.8, 1.3);
    const bellyMat = new THREE.MeshStandardMaterial({ color: colors.belly, flatShading: true });
    const belly = new THREE.Mesh(bellyGeo, bellyMat);
    belly.position.set(0, 0.45, 0.05);
    this.mesh.add(belly);
    
    // 2. 头部
    const headGeo = new THREE.SphereGeometry(0.3, 10, 10);
    const headMat = new THREE.MeshStandardMaterial({ color: colors.primary, flatShading: true });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(0, 0.9, 0.4);
    head.castShadow = true;
    this.mesh.add(head);
    
    // 眼睛
    const eyeGeo = new THREE.SphereGeometry(0.05, 6, 6);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x212121 });
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(0.18, 0.95, 0.6);
    this.mesh.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(-0.18, 0.95, 0.6);
    this.mesh.add(rightEye);
    
    // 3. 喙
    const beakGeo = new THREE.ConeGeometry(0.08, 0.3, 8);
    const beakMat = new THREE.MeshStandardMaterial({ color: colors.beak, flatShading: true });
    const beak = new THREE.Mesh(beakGeo, beakMat);
    beak.rotation.x = -Math.PI / 2;
    beak.position.set(0, 0.9, 0.75);
    this.mesh.add(beak);
    
    // 4. 冠羽 (装饰)
    const crestGeo = new THREE.ConeGeometry(0.06, 0.25, 4);
    crestGeo.rotateX(-0.5);
    const crestMat = new THREE.MeshStandardMaterial({ color: colors.crest, flatShading: true });
    
    const crest1 = new THREE.Mesh(crestGeo, crestMat);
    crest1.position.set(0, 1.15, 0.4);
    this.mesh.add(crest1);
    
    const crest2 = crest1.clone();
    crest2.scale.set(0.8, 0.8, 0.8);
    crest2.rotation.x = -0.3;
    crest2.position.set(0, 1.1, 0.25);
    this.mesh.add(crest2);
    
    // 5. 翅膀 (作为组，方便旋转动画)
    this.leftWing = new THREE.Group();
    this.rightWing = new THREE.Group();
    
    const wingGeo = new THREE.BufferGeometry();
    // 自定义简单的翅膀形状顶点
    const wingVertices = new Float32Array([
      0, 0, 0,   0.8, 0, 0.2,   0, 0, 0.5, // 根部三角
      0.8, 0, 0.2,  1.2, 0, -0.2,  0, 0, 0.5, // 翼尖三角
    ]);
    wingGeo.setAttribute('position', new THREE.BufferAttribute(wingVertices, 3));
    wingGeo.computeVertexNormals();
    
    const wingMat = new THREE.MeshStandardMaterial({ 
      color: colors.secondary, 
      side: THREE.DoubleSide,
      flatShading: true 
    });
    
    const lWingMesh = new THREE.Mesh(wingGeo, wingMat);
    const rWingMesh = new THREE.Mesh(wingGeo, wingMat);
    
    // 调整右翅膀对称
    rWingMesh.scale.x = -1;
    
    this.leftWing.add(lWingMesh);
    this.rightWing.add(rWingMesh);
    
    this.leftWing.position.set(0.2, 0.6, 0.2);
    this.rightWing.position.set(-0.2, 0.6, 0.2);
    
    this.mesh.add(this.leftWing);
    this.mesh.add(this.rightWing);
    
    // 6. 尾羽
    const tailGeo = new THREE.ConeGeometry(0.2, 0.6, 4);
    tailGeo.scale(1, 0.2, 1); // 压扁
    const tailMat = new THREE.MeshStandardMaterial({ color: colors.secondary, flatShading: true });
    const tail = new THREE.Mesh(tailGeo, tailMat);
    tail.position.set(0, 0.5, -0.8);
    tail.rotation.x = -Math.PI / 2 + 0.3;
    this.mesh.add(tail);
    
    // 7. 探照灯 (挂在脖子上?)
    const light = new THREE.SpotLight(0xffffff, 2, 25, 0.6, 0.5, 1);
    light.position.set(0, 0.8, 0.5);
    light.target.position.set(0, 0, 6);
    this.mesh.add(light);
    this.mesh.add(light.target);
    
    // 8. 魔法粒子/飞行尾迹 (替代原来的火焰)
    const trailGeo = new THREE.ConeGeometry(0.1, 0.4, 6);
    const trailMat = new THREE.MeshBasicMaterial({ color: 0x4fc3f7, transparent: true, opacity: 0.6 });
    this.trail = new THREE.Mesh(trailGeo, trailMat);
    this.trail.position.set(0, 0.4, -0.9);
    this.trail.rotation.x = Math.PI / 2;
    this.trail.visible = false;
    this.mesh.add(this.trail);
    
    this.scene.add(this.mesh);
  }
  
  setSprinting(isSprinting) {
    this.isSprinting = isSprinting;
    // 如果不在滑翔加速状态，立即切换目标速度
    if (this.body.velocity.y >= 0) {
        this.currentSpeed = isSprinting ? this.sprintSpeed : this.speed;
    }
  }
  
  setFlying(isFlying) {
    this.isFlying = isFlying;
    this.trail.visible = isFlying;
    
    if (isFlying) {
      this.trail.scale.setScalar(0.8 + Math.random() * 0.4);
    }
  }
  
  move(direction, deltaTime) {
    const len = Math.sqrt(direction.x * direction.x + direction.z * direction.z);
    this.isMoving = len > 0;
    
    // 平滑水平移动 (使用 lerp 减少瞬时抖动)
    let targetVx = 0;
    let targetVz = 0;
    
    if (this.isMoving) {
      const dx = direction.x / len;
      const dz = direction.z / len;
      targetVx = dx * this.currentSpeed;
      targetVz = dz * this.currentSpeed;
      
      this.targetRotation = Math.atan2(dx, dz);
    }
    
    // 水平速度平滑过渡
    const hLerp = 5 * deltaTime;
    this.body.velocity.x = THREE.MathUtils.lerp(this.body.velocity.x, targetVx, hLerp);
    this.body.velocity.z = THREE.MathUtils.lerp(this.body.velocity.z, targetVz, hLerp);
    
    // 垂直逻辑
    if (this.isFlying) {
      // 施加一个向上的力 (加速度)，而不是直接设置速度
      // 这样会有惯性，松开后还会继续上升一点
      // 增加上升力度 (40 -> 80)
      this.body.velocity.y += 80 * deltaTime;
      
      // 取消最大上升速度限制，允许无限加速
      
    } else {
      // 滑翔/下落逻辑
      // 如果正在下落 (velocity.y < 0) 且在移动，进入滑翔模式
      if (this.body.velocity.y < 0) {
        if (this.isMoving) {
          // 滑翔加速逻辑：将重力势能转化为动能
          // 下落速度越快，水平速度加成越高
          const dropSpeed = Math.abs(this.body.velocity.y);
          const glideBoost = Math.min(dropSpeed * 0.8, 20); // 速度加成上限
          
          // 目标水平速度 = 当前基础速度 + 滑翔加成
          const targetGlideSpeed = (this.isSprinting ? this.sprintSpeed : this.speed) + glideBoost;
          
          // 平滑加速到滑翔速度
          this.currentSpeed = THREE.MathUtils.lerp(this.currentSpeed, targetGlideSpeed, 1 * deltaTime);
          
          // 限制最大下落速度 (升力)
          // 速度越快，升力越大，下落越慢
          const liftFactor = Math.min(this.currentSpeed / this.sprintSpeed, 1.0);
          const terminalVelocity = THREE.MathUtils.lerp(-40, -5, liftFactor); // 高速时下落很慢
          
          if (this.body.velocity.y < terminalVelocity) {
             this.body.velocity.y = THREE.MathUtils.lerp(this.body.velocity.y, terminalVelocity, 3 * deltaTime);
          }
        } else {
           // 未移动时，正常下落，恢复正常速度
           this.currentSpeed = THREE.MathUtils.lerp(this.currentSpeed, this.speed, 2 * deltaTime);
        }
      } else {
        // 上升过程中松开空格，恢复正常速度
        this.currentSpeed = THREE.MathUtils.lerp(this.currentSpeed, this.isSprinting ? this.sprintSpeed : this.speed, 5 * deltaTime);
      }
    }
    
    // 旋转平滑
    let rotDiff = this.targetRotation - this.mesh.rotation.y;
    while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
    while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
    this.mesh.rotation.y += rotDiff * 8 * deltaTime;
    
    // 身体倾斜动画
    // 1. 前倾 (加速或俯冲)
    let targetPitch = 0;
    // 飞行或冲刺时前倾
    if (this.isMoving && (this.isSprinting || this.isFlying)) targetPitch = 0.5;
    // 下落且速度快时(俯冲)也前倾
    if (!this.isFlying && this.body.velocity.y < -5 && this.isMoving) targetPitch = 0.8;
    
    this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, targetPitch, 4 * deltaTime);
    
    // 2. 侧倾 (转向时)
    let targetRoll = -rotDiff * 0.8; // 增加侧倾感
    targetRoll = Math.max(-0.8, Math.min(0.8, targetRoll));
    if (!this.isMoving) targetRoll = 0;
    
    this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, targetRoll, 4 * deltaTime);
    
    // 翅膀动画
    this.animateWings(deltaTime);
  }
  
  animateWings(deltaTime) {
    let targetFlapSpeed = 0;
    let flapAmplitude = 0.4; 
    
    if (this.isFlying) {
      targetFlapSpeed = 18; // 上升时剧烈扇动
      flapAmplitude = 0.9;
    } else if (this.isMoving) {
      // 滑翔时翅膀几乎不动或慢动
      if (this.body.velocity.y < -2) { // 俯冲/滑翔状态
         targetFlapSpeed = 0; // 展翅滑翔
         flapAmplitude = 0;
         // 保持翅膀平展
         this.wingAngle = Math.PI / 2; 
      } else {
         targetFlapSpeed = 8;
         flapAmplitude = 0.3;
      }
    } else {
      targetFlapSpeed = 2;
      flapAmplitude = 0.1;
    }
    
    // 如果不是滑翔锁定状态，更新翅膀角度
    if (flapAmplitude > 0) {
        this.flapSpeed = THREE.MathUtils.lerp(this.flapSpeed, targetFlapSpeed, 5 * deltaTime);
        this.wingAngle += this.flapSpeed * deltaTime;
        const angle = Math.sin(this.wingAngle) * flapAmplitude;
        this.leftWing.rotation.z = angle; 
        this.rightWing.rotation.z = -angle;
    } else {
        // 滑翔姿态：平举
        this.leftWing.rotation.z = THREE.MathUtils.lerp(this.leftWing.rotation.z, 0, 5 * deltaTime);
        this.rightWing.rotation.z = THREE.MathUtils.lerp(this.rightWing.rotation.z, 0, 5 * deltaTime);
    }
  }
  
  update() {
    this.mesh.position.copy(this.body.position);
    this.mesh.position.y -= 0.4; 
  }
  
  getPosition() {
    return this.mesh.position;
  }
  
  setPosition(x, y, z) {
    this.body.position.set(x, y, z);
    this.body.velocity.set(0, 0, 0);
    this.mesh.position.set(x, y, z);
  }
}
