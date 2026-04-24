import * as CANNON from 'cannon-es';

export class PhysicsWorld {
  world: CANNON.World;
  private bodies: CANNON.Body[] = [];

  constructor() {
    this.world = new CANNON.World();
    this.world.gravity.set(0, -30, 0);
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);

    const defaultMaterial = new CANNON.Material('default');
    const defaultContactMaterial = new CANNON.ContactMaterial(
      defaultMaterial,
      defaultMaterial,
      {
        friction: 0.3,
        restitution: 0.0
      }
    );
    this.world.addContactMaterial(defaultContactMaterial);
    this.world.defaultContactMaterial = defaultContactMaterial;
  }

  addPlayerBody(position: { x: number; y: number; z: number }, radius: number): CANNON.Body {
    const shape = new CANNON.Sphere(radius);
    const body = new CANNON.Body({
      mass: 60,
      shape: shape,
      position: new CANNON.Vec3(position.x, position.y + 2, position.z),
      linearDamping: 0.1,
      angularDamping: 0.99,
      fixedRotation: true,
      type: CANNON.Body.DYNAMIC
    });

    this.world.addBody(body);
    this.bodies.push(body);
    return body;
  }

  removeBody(body: CANNON.Body): void {
    this.world.removeBody(body);
    const index = this.bodies.indexOf(body);
    if (index > -1) {
      this.bodies.splice(index, 1);
    }
  }

  addBody(body: CANNON.Body): void {
    this.world.addBody(body);
    this.bodies.push(body);
  }

  update(deltaTime: number): void {
    const fixedTimeStep = 1 / 60;
    const maxSubSteps = 5;
    const clampedDelta = Math.min(deltaTime, 0.1);
    this.world.step(fixedTimeStep, clampedDelta, maxSubSteps);
  }
}
