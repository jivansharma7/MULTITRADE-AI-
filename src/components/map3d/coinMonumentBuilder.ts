import * as THREE from 'three';
import type { CoinMonumentNode } from '../../shared/coinMap3dLayout';
import { createTokenPlaqueTexture } from './proceduralTextures';

export interface AnimatedCoinEntry {
  mint: string;
  node: CoinMonumentNode;
  group: THREE.Group;
  crystal: THREE.Mesh;
  orbitRing: THREE.Mesh;
  haloRing: THREE.Mesh;
  baseCrystalY: number;
  orbitSpeed: number;
  phase: number;
}

export interface CoinWorldObjects {
  rootGroup: THREE.Group;
  hubGroup: THREE.Group;
  hubRings: THREE.Mesh[];
  coinEntries: AnimatedCoinEntry[];
  pickTargets: THREE.Object3D[];
  dispose: () => void;
}

function makeFacetedObeliskProfile(radius: number, height: number): {
  lowerShaft: THREE.CylinderGeometry;
  upperShaft: THREE.CylinderGeometry;
  capCrown: THREE.CylinderGeometry;
} {
  const lowerH = height * 0.56;
  const upperH = height * 0.34;
  const capH = height * 0.1;
  const lowerShaft = new THREE.CylinderGeometry(radius * 0.86, radius * 1.06, lowerH, 6);
  const upperShaft = new THREE.CylinderGeometry(radius * 0.62, radius * 0.84, upperH, 6);
  const capCrown = new THREE.CylinderGeometry(radius * 0.34, radius * 0.64, capH, 6);
  return { lowerShaft, upperShaft, capCrown };
}

export function buildSolanaHubGroup(
  contactShadowTex: THREE.Texture,
  isSoftwareGl: boolean
): { hubGroup: THREE.Group; hubRings: THREE.Mesh[]; disposables: Array<{ dispose: () => void }> } {
  const disposables: Array<{ dispose: () => void }> = [];
  const hubGroup = new THREE.Group();
  hubGroup.position.set(0, 0, 0);

  const shadowMat = new THREE.MeshBasicMaterial({
    map: contactShadowTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.75,
  });
  const shadowGeo = new THREE.PlaneGeometry(5.6, 5.6);
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.y = 0.015;
  hubGroup.add(shadowMesh);
  disposables.push(shadowMat, shadowGeo);

  const plinthGeo = new THREE.CylinderGeometry(1.75, 2.05, 0.36, 8);
  const plinthMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.35,
    metalness: 0.78,
    flatShading: true,
  });
  const plinth = new THREE.Mesh(plinthGeo, plinthMat);
  plinth.position.y = 0.18;
  plinth.receiveShadow = true;
  plinth.castShadow = true;
  hubGroup.add(plinth);
  disposables.push(plinthGeo, plinthMat);

  const collarGeo = new THREE.TorusGeometry(1.5, 0.06, 12, 48);
  const collarMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0ea5e9,
    emissiveIntensity: 0.75,
    roughness: 0.25,
    metalness: 0.85,
  });
  const collar = new THREE.Mesh(collarGeo, collarMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.37;
  hubGroup.add(collar);
  disposables.push(collarGeo, collarMat);

  const spireParts = makeFacetedObeliskProfile(0.72, 2.2);
  const spireMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.24,
    metalness: 0.84,
    flatShading: true,
  });
  const lowerH = 2.2 * 0.56;
  const upperH = 2.2 * 0.34;
  const capH = 2.2 * 0.1;

  const lowerMesh = new THREE.Mesh(spireParts.lowerShaft, spireMat);
  lowerMesh.position.y = 0.36 + lowerH / 2;
  lowerMesh.castShadow = true;
  lowerMesh.receiveShadow = true;
  hubGroup.add(lowerMesh);

  const upperMesh = new THREE.Mesh(spireParts.upperShaft, spireMat);
  upperMesh.position.y = 0.36 + lowerH + upperH / 2;
  upperMesh.castShadow = true;
  hubGroup.add(upperMesh);

  const capMesh = new THREE.Mesh(spireParts.capCrown, spireMat);
  capMesh.position.y = 0.36 + lowerH + upperH + capH / 2;
  hubGroup.add(capMesh);

  disposables.push(spireParts.lowerShaft, spireParts.upperShaft, spireParts.capCrown, spireMat);

  const coreGeo = new THREE.OctahedronGeometry(0.65, 0);
  const coreMat = isSoftwareGl
    ? new THREE.MeshStandardMaterial({
        color: 0x60a5fa,
        emissive: 0x2563eb,
        emissiveIntensity: 0.65,
        roughness: 0.16,
        metalness: 0.25,
        flatShading: true,
      })
    : new THREE.MeshPhysicalMaterial({
        color: 0x60a5fa,
        emissive: 0x2563eb,
        emissiveIntensity: 0.55,
        roughness: 0.12,
        metalness: 0.1,
        clearcoat: 1,
        clearcoatRoughness: 0.1,
        flatShading: true,
      });
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.position.y = 3.25;
  core.castShadow = true;
  hubGroup.add(core);
  disposables.push(coreGeo, coreMat);

  const hubRings: THREE.Mesh[] = [];
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x93c5fd,
    emissive: 0x3b82f6,
    emissiveIntensity: 0.45,
    roughness: 0.2,
    metalness: 0.9,
  });
  disposables.push(ringMat);

  const ringRadii = [1.05, 1.32];
  ringRadii.forEach((r, idx) => {
    const rGeo = new THREE.TorusGeometry(r, 0.032, 10, 48);
    const rMesh = new THREE.Mesh(rGeo, ringMat);
    rMesh.position.y = 3.25;
    rMesh.rotation.x = idx === 0 ? 0.65 : -0.7;
    rMesh.rotation.y = idx * 0.8;
    hubGroup.add(rMesh);
    hubRings.push(rMesh);
    disposables.push(rGeo);
  });

  return { hubGroup, hubRings, disposables };
}

export function buildCoinConstellationWorld(params: {
  nodes: CoinMonumentNode[];
  contactShadowTex: THREE.Texture;
  maxAnisotropy: number;
  isSoftwareGl: boolean;
}): CoinWorldObjects {
  const { nodes, contactShadowTex, maxAnisotropy, isSoftwareGl } = params;
  const rootGroup = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];

  // Shared materials for structural dark metal parts
  const obsidianMat = new THREE.MeshStandardMaterial({
    color: 0x0d1424,
    roughness: 0.38,
    metalness: 0.72,
    flatShading: true,
  });
  const strutMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.35,
    metalness: 0.85,
  });
  const shadowMat = new THREE.MeshBasicMaterial({
    map: contactShadowTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.68,
  });
  const unitShadowGeo = new THREE.PlaneGeometry(1, 1);
  const unitCrystalGeo = new THREE.OctahedronGeometry(1, 0);
  const unitPlaqueGeo = new THREE.PlaneGeometry(1.75, 0.76);
  const unitStrutGeo = new THREE.BoxGeometry(0.12, 0.38, 0.12);

  disposables.push(
    obsidianMat,
    strutMat,
    shadowMat,
    unitShadowGeo,
    unitCrystalGeo,
    unitPlaqueGeo,
    unitStrutGeo
  );

  // Material pools keyed by hex color to reduce shader switches
  const accentMatCache = new Map<string, THREE.MeshStandardMaterial>();
  const crystalMatCache = new Map<string, THREE.Material>();

  const getAccentMat = (hex: string) => {
    const key = hex.toLowerCase();
    let mat = accentMatCache.get(key);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(hex),
        emissive: new THREE.Color(hex),
        emissiveIntensity: 0.48,
        roughness: 0.24,
        metalness: 0.78,
      });
      accentMatCache.set(key, mat);
      disposables.push(mat);
    }
    return mat;
  };

  const getCrystalMat = (hex: string) => {
    const key = hex.toLowerCase();
    let mat = crystalMatCache.get(key);
    if (!mat) {
      mat = isSoftwareGl
        ? new THREE.MeshStandardMaterial({
            color: new THREE.Color(hex),
            emissive: new THREE.Color(hex),
            emissiveIntensity: 0.52,
            roughness: 0.16,
            metalness: 0.18,
            flatShading: true,
          })
        : new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(hex),
            emissive: new THREE.Color(hex),
            emissiveIntensity: 0.48,
            roughness: 0.12,
            metalness: 0.12,
            clearcoat: 1,
            clearcoatRoughness: 0.08,
            flatShading: true,
          });
      crystalMatCache.set(key, mat);
      disposables.push(mat);
    }
    return mat;
  };

  // Build central Solana Core Hub
  const { hubGroup, hubRings, disposables: hubDisposables } = buildSolanaHubGroup(
    contactShadowTex,
    isSoftwareGl
  );
  rootGroup.add(hubGroup);
  disposables.push(...hubDisposables);

  // Constellation link lines from each coin pedestal to central hub
  const linkPoints: number[] = [];
  const coinEntries: AnimatedCoinEntry[] = [];
  const pickTargets: THREE.Object3D[] = [];

  nodes.forEach((node, idx) => {
    const group = new THREE.Group();
    group.position.set(node.position[0], 0, node.position[2]);
    group.userData = { mint: node.mint };

    const accentMat = getAccentMat(node.accentHex);
    const crystalMat = getCrystalMat(node.rimHex);

    // 1. Contact Shadow
    const shadow = new THREE.Mesh(unitShadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.015;
    const shadowScale = node.pedestalRadius * 3.1;
    shadow.scale.set(shadowScale, shadowScale, 1);
    group.add(shadow);

    // 2. Hexagonal Chamfered Plinth Base
    const plinthHeight = 0.28;
    const plinthGeo = new THREE.CylinderGeometry(
      node.pedestalRadius * 0.9,
      node.pedestalRadius,
      plinthHeight,
      6
    );
    const plinth = new THREE.Mesh(plinthGeo, obsidianMat);
    plinth.position.y = plinthHeight / 2;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    plinth.userData = { mint: node.mint };
    group.add(plinth);
    pickTargets.push(plinth);
    disposables.push(plinthGeo);

    // 3. Anodized Momentum Collar Ring
    const collarGeo = new THREE.TorusGeometry(node.pedestalRadius * 0.84, 0.045, 10, 32);
    const collar = new THREE.Mesh(collarGeo, accentMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = plinthHeight + 0.02;
    group.add(collar);
    disposables.push(collarGeo);

    // 4. Stepped Architectural Hexagonal Obelisk Spire + Glowing Mid Collar
    const spireMat = new THREE.MeshStandardMaterial({
      color: 0x111c33,
      emissive: new THREE.Color(node.accentHex),
      emissiveIntensity: 0.16,
      roughness: 0.26,
      metalness: 0.78,
      flatShading: true,
    });
    const { lowerShaft, upperShaft, capCrown } = makeFacetedObeliskProfile(
      node.spireRadius,
      node.monumentHeight
    );
    const lowerH = node.monumentHeight * 0.56;
    const upperH = node.monumentHeight * 0.34;
    const capH = node.monumentHeight * 0.1;

    const lowerMesh = new THREE.Mesh(lowerShaft, spireMat);
    lowerMesh.position.y = plinthHeight + lowerH / 2;
    lowerMesh.castShadow = true;
    lowerMesh.receiveShadow = true;
    lowerMesh.userData = { mint: node.mint };
    group.add(lowerMesh);
    pickTargets.push(lowerMesh);

    // Glowing Mid-Shaft Telemetry Band
    const midBandGeo = new THREE.CylinderGeometry(
      node.spireRadius * 0.89,
      node.spireRadius * 0.91,
      0.08,
      6
    );
    const midBand = new THREE.Mesh(midBandGeo, accentMat);
    midBand.position.y = plinthHeight + lowerH;
    group.add(midBand);

    const upperMesh = new THREE.Mesh(upperShaft, spireMat);
    upperMesh.position.y = plinthHeight + lowerH + upperH / 2;
    upperMesh.castShadow = true;
    upperMesh.userData = { mint: node.mint };
    group.add(upperMesh);
    pickTargets.push(upperMesh);

    const capMesh = new THREE.Mesh(capCrown, spireMat);
    capMesh.position.y = plinthHeight + lowerH + upperH + capH / 2;
    capMesh.userData = { mint: node.mint };
    group.add(capMesh);
    pickTargets.push(capMesh);

    disposables.push(lowerShaft, upperShaft, capCrown, midBandGeo, spireMat);

    // 5. Floating Faceted Crown Crystal above spire
    const baseCrystalY = plinthHeight + node.monumentHeight + 0.58;
    const crystal = new THREE.Mesh(unitCrystalGeo, crystalMat);
    const cScale = 0.34 + node.spireRadius * 0.38;
    crystal.scale.set(cScale, cScale * 1.35, cScale);
    crystal.position.y = baseCrystalY;
    crystal.castShadow = true;
    crystal.userData = { mint: node.mint };
    group.add(crystal);
    pickTargets.push(crystal);

    // 6. Tilted Orbital Momentum Ring around crystal
    const orbitRingGeo = new THREE.TorusGeometry(cScale * 1.65, 0.026, 8, 36);
    const orbitRing = new THREE.Mesh(orbitRingGeo, accentMat);
    orbitRing.position.y = baseCrystalY;
    orbitRing.rotation.x = 1.05;
    orbitRing.rotation.y = idx * 0.45;
    group.add(orbitRing);
    disposables.push(orbitRingGeo);

    // 7. Angled Telemetry Display Plaque facing outward from arena center
    const plaqueTex = createTokenPlaqueTexture(node, maxAnisotropy);
    const plaqueMat = new THREE.MeshBasicMaterial({
      map: plaqueTex,
      side: THREE.DoubleSide,
    });
    const plaqueGroup = new THREE.Group();
    const outAngle = Math.atan2(node.position[0], node.position[2]);
    const plaqueDist = node.pedestalRadius * 0.92 + 0.36;
    plaqueGroup.position.set(
      Math.sin(outAngle) * plaqueDist,
      0.42,
      Math.cos(outAngle) * plaqueDist
    );
    plaqueGroup.rotation.y = outAngle;

    const strut = new THREE.Mesh(unitStrutGeo, strutMat);
    strut.position.set(0, -0.18, -0.05);
    plaqueGroup.add(strut);

    const plaque = new THREE.Mesh(unitPlaqueGeo, plaqueMat);
    plaque.rotation.x = -0.38;
    plaque.userData = { mint: node.mint };
    plaqueGroup.add(plaque);
    pickTargets.push(plaque);
    group.add(plaqueGroup);
    disposables.push(plaqueTex, plaqueMat);

    // 8. Selection / Hover Ground Halo Ring
    const haloGeo = new THREE.RingGeometry(
      node.pedestalRadius * 1.12,
      node.pedestalRadius * 1.3,
      32
    );
    const haloMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(node.rimHex),
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const haloRing = new THREE.Mesh(haloGeo, haloMat);
    haloRing.rotation.x = -Math.PI / 2;
    haloRing.position.y = 0.025;
    group.add(haloRing);
    disposables.push(haloGeo, haloMat);

    rootGroup.add(group);
    coinEntries.push({
      mint: node.mint,
      node,
      group,
      crystal,
      orbitRing,
      haloRing,
      baseCrystalY,
      orbitSpeed: node.orbitSpeed,
      phase: idx * 0.72,
    });

    // Add constellation filament line to center hub
    linkPoints.push(0, 0.08, 0, node.position[0], 0.08, node.position[2]);
  });

  // Constellation Filament Lines
  if (linkPoints.length > 0) {
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linkPoints, 3));
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.22,
    });
    const links = new THREE.LineSegments(lineGeo, lineMat);
    rootGroup.add(links);
    disposables.push(lineGeo, lineMat);
  }

  // InstancedMesh Perimeter Telemetry Pylons (48 perimeter beacons)
  const pylonCount = 48;
  const pylonGeo = new THREE.CylinderGeometry(0.06, 0.11, 1.35, 6);
  const pylonMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    emissive: 0x1d4ed8,
    emissiveIntensity: 0.25,
    roughness: 0.4,
    metalness: 0.8,
  });
  const instancedPylons = new THREE.InstancedMesh(pylonGeo, pylonMat, pylonCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < pylonCount; i++) {
    const ang = (i / pylonCount) * Math.PI * 2;
    const rad = 26.5 + (i % 3) * 1.8;
    const hScale = 0.65 + (i % 4) * 0.25;
    dummy.position.set(Math.cos(ang) * rad, (1.35 * hScale) / 2, Math.sin(ang) * rad);
    dummy.scale.set(1, hScale, 1);
    dummy.rotation.y = ang;
    dummy.updateMatrix();
    instancedPylons.setMatrixAt(i, dummy.matrix);
  }
  instancedPylons.instanceMatrix.needsUpdate = true;
  rootGroup.add(instancedPylons);
  disposables.push(pylonGeo, pylonMat);

  // Ambient Space Telemetry Starfield Points (600 points)
  const starCount = 600;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const ang = (i * 2.39996) % (Math.PI * 2);
    const r = 12 + ((i * 17) % 44);
    const y = 3.5 + ((i * 29) % 24);
    starPositions[i * 3] = Math.cos(ang) * r;
    starPositions[i * 3 + 1] = y;
    starPositions[i * 3 + 2] = Math.sin(ang) * r;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0x7dd3fc,
    size: 0.16,
    transparent: true,
    opacity: 0.55,
    sizeAttenuation: true,
  });
  const stars = new THREE.Points(starGeo, starMat);
  rootGroup.add(stars);
  disposables.push(starGeo, starMat);

  const dispose = () => {
    for (const d of disposables) {
      d.dispose();
    }
  };

  return {
    rootGroup,
    hubGroup,
    hubRings,
    coinEntries,
    pickTargets,
    dispose,
  };
}
