// src/ecs/entities/createPlayer.js

import * as THREE from 'three';
import { createTransform } from '../components/Transform.js';
import { createPhysics } from '../components/Physics.js';
import { createPlayer as createPlayerComponent } from '../components/Player.js';
import { createWeapon, createLoadout } from '../components/Weapon.js';
import { createInput } from '../components/Input.js';
import { GAME_CONFIG, peerIdToNumeric } from '../../config/constants.js';
import { WORLD_CONFIG } from '../../config/world.js';

export function createPlayer(
  ecsWorld,
  physicsWorld,
  sceneOrManager,
  playerId,
  spawnPos = { ...WORLD_CONFIG.PLAYER.SPAWN_POINTS[0] },
  isLocal = false,
  isHost = false
) {
  const scene = sceneOrManager?.scene ? sceneOrManager.scene : sceneOrManager;

  const groundedY = spawnPos.y ?? (
    WORLD_CONFIG.GROUND_Y + GAME_CONFIG.PLAYER_HEIGHT / 2
  );

  const phys = physicsWorld.createPlayerBody(
    spawnPos.x,
    groundedY,
    spawnPos.z,
    GAME_CONFIG.PLAYER_RADIUS,
    GAME_CONFIG.PLAYER_HEIGHT
  );

  const teamColor = isLocal ? 0x258cff : 0xe84b4b;
  const darkColor = isLocal ? 0x12365f : 0x4a1515;
  const skinColor = 0xd49a72;
  const weaponColor = 0x20242a;

  const mesh = new THREE.Group();
  mesh.name = 'PlayerCharacter';
  mesh.position.set(spawnPos.x, groundedY, spawnPos.z);

  const makeMat = (color, roughness = 0.65, metalness = 0.05) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.46, 6, 10), makeMat(teamColor));
  body.name = 'body';
  body.position.y = 0.02;
  body.scale.set(1, 1.15, 0.72);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.205, 12, 8), makeMat(skinColor, 0.8));
  head.name = 'head';
  head.position.y = 0.62;

  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.225, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62),
    makeMat(darkColor, 0.45, 0.2)
  );
  helmet.name = 'helmet';
  helmet.position.y = 0.69;

  const limbMat = makeMat(teamColor);
  const armGeo = new THREE.CapsuleGeometry(0.075, 0.38, 5, 8);
  const legGeo = new THREE.CapsuleGeometry(0.09, 0.48, 5, 8);
  const leftArm = new THREE.Mesh(armGeo, limbMat);
  const rightArm = new THREE.Mesh(armGeo, limbMat);
  const leftLeg = new THREE.Mesh(legGeo, limbMat);
  const rightLeg = new THREE.Mesh(legGeo, limbMat);
  leftArm.name = 'leftArm'; rightArm.name = 'rightArm';
  leftLeg.name = 'leftLeg'; rightLeg.name = 'rightLeg';
  leftArm.position.set(-0.34, 0.03, 0);
  rightArm.position.set(0.34, 0.03, 0);
  leftLeg.position.set(-0.14, -0.58, 0);
  rightLeg.position.set(0.14, -0.58, 0);

  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.42, 0.14), makeMat(darkColor, 0.8));
  backpack.position.set(0, 0.05, 0.25);

  const remoteWeapon = new THREE.Group();
  remoteWeapon.name = 'remoteWeapon';
  remoteWeapon.position.set(0.26, 0.03, -0.24);
  const gunMat = makeMat(weaponColor, 0.3, 0.65);
  const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.12, 0.42), gunMat);
  const gunStock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.24), gunMat);
  const gunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.38, 8), makeMat(0x111317, 0.25, 0.8));
  gunBarrel.rotation.x = Math.PI / 2;
  gunBody.position.z = -0.03;
  gunStock.position.z = 0.16;
  gunBarrel.position.z = -0.39;
  remoteWeapon.add(gunStock, gunBody, gunBarrel);

  const healthBack = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.055), makeMat(0x241010, 0.9));
  const healthFill = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.035), makeMat(0x55d66f, 0.55));
  healthBack.name = 'healthBack';
  healthFill.name = 'healthFill';
  healthBack.position.set(0, 1.02, 0);
  healthFill.position.set(0, 1.02, -0.003);
  healthBack.material.depthTest = false;
  healthFill.material.depthTest = false;
  healthBack.renderOrder = 10;
  healthFill.renderOrder = 11;

  const teamRing = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.018, 6, 24), makeMat(teamColor, 0.5, 0.1));
  teamRing.name = 'teamRing';
  teamRing.rotation.x = Math.PI / 2;
  teamRing.position.y = -0.88;

  mesh.add(body, head, helmet, leftArm, rightArm, leftLeg, rightLeg, backpack, remoteWeapon, healthBack, healthFill, teamRing);
  mesh.traverse((child) => {
    if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }
  });
  if (isLocal) mesh.visible = false;
  if (scene?.add) scene.add(mesh);

  const character = {
    mesh,
    parts: { head, helmet, leftArm, rightArm, healthFill, healthBack, remoteWeapon, teamRing },
    setWeaponType(typeId) {
      const scale = typeId === 3 ? 1.18 : typeId === 4 ? 1.3 : typeId === 2 ? 0.92 : 0.8;
      remoteWeapon.scale.set(scale, scale, scale);
    },
    updateVisuals({ stance = 0, pitch = 0, health = 100, maxHealth = 100, isDead = false }) {
      const crouch = stance === 1;
      const prone = stance === 2;
      mesh.scale.y = prone ? 0.42 : crouch ? 0.72 : 1;
      mesh.position.y = groundedY + (prone ? -0.58 : crouch ? -0.28 : 0);
      const aim = THREE.MathUtils.clamp(pitch * 0.45, -0.55, 0.55);
      head.rotation.x = aim;
      helmet.rotation.x = aim;
      leftArm.rotation.x = -0.55 - aim;
      rightArm.rotation.x = -0.55 - aim;
      const alive = !isDead && health > 0;
      mesh.visible = alive && !isLocal;
      healthBack.visible = alive && !isLocal;
      healthFill.visible = alive && !isLocal;
      teamRing.visible = alive && !isLocal;
      const ratio = THREE.MathUtils.clamp(Number(health) / Math.max(1, Number(maxHealth) || 100), 0, 1);
      healthFill.scale.x = ratio;
      healthFill.position.x = -0.29 * (1 - ratio);
    },
    dispose() {
      mesh.traverse((child) => {
        child.geometry?.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
          else child.material.dispose();
        }
      });
      mesh.removeFromParent();
    },
  };

  const peerId = typeof playerId === 'string' ? playerId : String(playerId ?? '');
  const numericId = peerIdToNumeric(playerId);

  const loadout = createLoadout();

  const activeWeapon = loadout.slots[0];

  const playerEntity = ecsWorld.add({
    player: createPlayerComponent(
      numericId,
      peerId,
      isLocal,
      isHost,
      GAME_CONFIG.MAX_HEALTH
    ),
    transform: createTransform(spawnPos.x, groundedY, spawnPos.z),
    physics: createPhysics(phys.body, phys.collider, phys.controller),
    weapon: activeWeapon,
    loadout,
    input: createInput(),
    character,
    renderMesh: { mesh },
  });

  character.setWeaponType(activeWeapon?.typeId ?? 1);
  character.updateVisuals({ health: GAME_CONFIG.MAX_HEALTH, maxHealth: GAME_CONFIG.MAX_HEALTH });

  if (physicsWorld?.registerColliderEntity) {
    physicsWorld.registerColliderEntity(phys.collider, playerEntity);
  }

  return playerEntity;
}
