import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { CameraPose, CoinMonumentNode } from '../../shared/coinMap3dLayout';
import { buildCoinConstellationWorld, type CoinWorldObjects } from './coinMonumentBuilder';
import {
  createArenaFloorTexture,
  createContactShadowTexture,
  createFloorRoughnessTexture,
} from './proceduralTextures';

interface CoinMapCanvasProps {
  nodes: CoinMonumentNode[];
  selectedMint: string | null;
  cameraPose: CameraPose;
  cameraPoseVersion: number;
  autoOrbit: boolean;
  onSelectCoin: (mint: string) => void;
}

interface HoverInfo {
  node: CoinMonumentNode;
  x: number;
  y: number;
}

function detectSoftwareGl(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    const isSoft = /SwiftShader|llvmpipe|Software Rasterizer|Microsoft Basic Render/i.test(renderer);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return isSoft;
  } catch {
    return false;
  }
}

export const CoinMapCanvas: React.FC<CoinMapCanvasProps> = ({
  nodes,
  selectedMint,
  cameraPose,
  cameraPoseVersion,
  autoOrbit,
  onSelectCoin,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);

  const selectedMintRef = useRef<string | null>(selectedMint);
  const hoveredMintRef = useRef<string | null>(null);
  const autoOrbitRef = useRef<boolean>(autoOrbit);
  const onSelectCoinRef = useRef(onSelectCoin);

  selectedMintRef.current = selectedMint;
  autoOrbitRef.current = autoOrbit;
  onSelectCoinRef.current = onSelectCoin;

  // Imperative scene rebuild + camera target refs so WebGL context stays mounted once
  const rebuildWorldRef = useRef<((nextNodes: CoinMonumentNode[]) => void) | null>(null);
  const flyToPoseRef = useRef<((pose: CameraPose) => void) | null>(null);
  const nodesRef = useRef<CoinMonumentNode[]>(nodes);
  nodesRef.current = nodes;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch (err: any) {
      setWebglError(err?.message || 'WebGL rendering context could not be initialized.');
      return;
    }

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const bgHex = 0x060913;
    scene.background = new THREE.Color(bgHex);
    scene.fog = new THREE.FogExp2(bgHex, 0.0145);

    const initialAspect = width / height;
    const camera = new THREE.PerspectiveCamera(
      initialAspect < 0.85 ? 60 : 46,
      initialAspect,
      0.25,
      220
    );
    camera.position.set(cameraPose.position[0], cameraPose.position[1], cameraPose.position[2]);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = 0.72;

    // Three-point warm key + cool fill + cobalt rim studio lighting
    const hemiLight = new THREE.HemisphereLight(0x7dd3fc, 0x070b14, 0.78);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1dc, 1.85);
    keyLight.position.set(16, 28, 18);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 85;
    keyLight.shadow.camera.left = -28;
    keyLight.shadow.camera.right = 28;
    keyLight.shadow.camera.top = 28;
    keyLight.shadow.camera.bottom = -28;
    keyLight.shadow.bias = -0.0004;
    keyLight.shadow.normalBias = 0.025;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.9);
    rimLight.position.set(-22, 14, -20);
    scene.add(rimLight);

    // Arena Floor Disc (y = 0) with procedural grid + calibrated radial roughness
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const floorMap = createArenaFloorTexture(maxAniso);
    const floorRoughMap = createFloorRoughnessTexture();
    const contactShadowTex = createContactShadowTexture();

    const floorGeo = new THREE.CircleGeometry(48, 72);
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorMap,
      roughnessMap: floorRoughMap,
      roughness: 0.72,
      metalness: 0.35,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = 0;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(cameraPose.target[0], cameraPose.target[1], cameraPose.target[2]);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.065;
    controls.minDistance = 5.5;
    controls.maxDistance = 58;
    controls.maxPolarAngle = Math.PI * 0.46;
    controls.minPolarAngle = 0.18;
    controls.autoRotateSpeed = 0.45;
    controls.update();

    // Camera fly-to state (pre-allocated scratch vectors)
    const desiredCamPos = new THREE.Vector3(...cameraPose.position);
    const desiredTarget = new THREE.Vector3(...cameraPose.target);
    let isFlying = false;

    const handleControlStart = () => {
      isFlying = false;
    };
    controls.addEventListener('start', handleControlStart);

    flyToPoseRef.current = (pose: CameraPose) => {
      desiredCamPos.set(pose.position[0], pose.position[1], pose.position[2]);
      desiredTarget.set(pose.target[0], pose.target[1], pose.target[2]);
      isFlying = true;
    };

    let world: CoinWorldObjects | null = null;
    const nodeLookup = new Map<string, CoinMonumentNode>();

    const rebuildWorld = (nextNodes: CoinMonumentNode[]) => {
      if (world) {
        scene.remove(world.rootGroup);
        world.dispose();
        world = null;
      }
      nodeLookup.clear();
      for (const n of nextNodes) nodeLookup.set(n.mint, n);

      world = buildCoinConstellationWorld({
        nodes: nextNodes,
        contactShadowTex,
        maxAnisotropy: maxAniso,
        isSoftwareGl,
      });
      scene.add(world.rootGroup);

      if (!isSoftwareGl) {
        renderer.compile(scene, camera);
      }
    };

    rebuildWorldRef.current = rebuildWorld;
    rebuildWorld(nodesRef.current);

    // Raycaster & pointer interaction
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    let pointerDownX = 0;
    let pointerDownY = 0;
    let lastPickMove = 0;

    const pickMintAt = (clientX: number, clientY: number): string | null => {
      if (!world) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(world.pickTargets, false);
      if (hits.length === 0) return null;
      const mint = hits[0].object.userData?.mint;
      return typeof mint === 'string' ? mint : null;
    };

    const handlePointerDown = (e: PointerEvent) => {
      pointerDownX = e.clientX;
      pointerDownY = e.clientY;
    };

    const handlePointerUp = (e: PointerEvent) => {
      const dist = Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY);
      if (dist > 6) return;
      const mint = pickMintAt(e.clientX, e.clientY);
      if (mint) {
        onSelectCoinRef.current(mint);
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastPickMove < 28) return;
      lastPickMove = now;
      const mint = pickMintAt(e.clientX, e.clientY);
      hoveredMintRef.current = mint;
      renderer.domElement.style.cursor = mint ? 'pointer' : 'grab';

      if (mint) {
        const node = nodeLookup.get(mint);
        if (node) {
          const rect = renderer.domElement.getBoundingClientRect();
          setHoverInfo({
            node,
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
          });
          return;
        }
      }
      setHoverInfo(null);
    };

    const handlePointerLeave = () => {
      hoveredMintRef.current = null;
      setHoverInfo(null);
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);
    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerleave', handlePointerLeave);

    const handleResize = () => {
      if (!container) return;
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      const aspect = w / h;
      camera.fov = aspect < 0.85 ? 60 : 46;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderer.render(scene, camera);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // Software-WebGL pacing helper via fenceSync + bounded fallback timeout
    const afterDraw = (cb: () => void) => {
      if (!isSoftwareGl) {
        requestAnimationFrame(cb);
        return;
      }
      const gl2 = renderer.getContext() as WebGL2RenderingContext;
      if (typeof gl2?.fenceSync === 'function') {
        const sync = gl2.fenceSync(gl2.SYNC_GPU_COMMANDS_COMPLETE, 0);
        const start = performance.now();
        const poll = () => {
          if (disposed) return;
          const res = sync ? gl2.clientWaitSync(sync, 0, 0) : gl2.ALREADY_SIGNALED;
          if (res === gl2.ALREADY_SIGNALED || res === gl2.CONDITION_SATISFIED || performance.now() - start > 80) {
            if (sync) gl2.deleteSync(sync);
            setTimeout(cb, 32);
          } else {
            setTimeout(poll, 12);
          }
        };
        setTimeout(poll, 16);
      } else {
        setTimeout(cb, 50);
      }
    };

    let disposed = false;
    let lastTime = performance.now();
    let elapsed = 0;

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;
      elapsed += dt;

      // Exponential camera fly-to damping
      if (isFlying) {
        const alpha = 1 - Math.exp(-5.5 * dt);
        camera.position.lerp(desiredCamPos, alpha);
        controls.target.lerp(desiredTarget, alpha);
        if (
          camera.position.distanceToSquared(desiredCamPos) < 0.004 &&
          controls.target.distanceToSquared(desiredTarget) < 0.004
        ) {
          camera.position.copy(desiredCamPos);
          controls.target.copy(desiredTarget);
          isFlying = false;
        }
      }

      controls.autoRotate = !isSoftwareGl && autoOrbitRef.current && !isFlying;
      controls.update();

      if (world) {
        for (let i = 0; i < world.hubRings.length; i++) {
          world.hubRings[i].rotation.z += dt * (i === 0 ? 0.55 : -0.4);
          world.hubRings[i].rotation.y += dt * 0.28;
        }

        const sel = selectedMintRef.current;
        const hov = hoveredMintRef.current;
        for (let i = 0; i < world.coinEntries.length; i++) {
          const entry = world.coinEntries[i];
          const bob = Math.sin(elapsed * 1.8 + entry.phase) * 0.1;
          entry.crystal.position.y = entry.baseCrystalY + bob;
          entry.crystal.rotation.y += dt * 0.85;
          entry.orbitRing.position.y = entry.baseCrystalY + bob;
          entry.orbitRing.rotation.z += dt * entry.orbitSpeed;

          const haloMat = entry.haloRing.material as THREE.MeshBasicMaterial;
          const isSelected = sel === entry.mint;
          const isHovered = hov === entry.mint;
          const targetOpacity = isSelected ? 0.92 : isHovered ? 0.58 : 0.0;
          haloMat.opacity += (targetOpacity - haloMat.opacity) * Math.min(1, dt * 12);
          if (isSelected) {
            const pulseScale = 1 + Math.sin(elapsed * 3.5) * 0.04;
            entry.haloRing.scale.set(pulseScale, pulseScale, 1);
          } else {
            entry.haloRing.scale.set(1, 1, 1);
          }
        }
      }

      renderer.render(scene, camera);
      afterDraw(tick);
    };

    // Render immediate first frame so canvas never starts blank
    renderer.render(scene, camera);
    afterDraw(tick);

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      controls.removeEventListener('start', handleControlStart);
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave);

      if (world) {
        scene.remove(world.rootGroup);
        world.dispose();
      }
      floorGeo.dispose();
      floorMat.dispose();
      floorMap.dispose();
      floorRoughMap.dispose();
      contactShadowTex.dispose();
      envTarget.dispose();
      pmrem.dispose();
      renderer.dispose();

      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    rebuildWorldRef.current?.(nodes);
  }, [nodes]);

  useEffect(() => {
    flyToPoseRef.current?.(cameraPose);
  }, [cameraPoseVersion, cameraPose]);

  if (webglError) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#060913] p-6 text-center">
        <div className="max-w-md rounded-xl border border-slate-800 bg-[#0D1322] p-6">
          <div className="font-display text-base font-bold text-white">3D WebGL Unavailable</div>
          <p className="mt-2 text-xs text-slate-400">{webglError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#060913]">
      <div ref={mountRef} className="h-full w-full" aria-label="Interactive 3D Top Coins Visual Map" />

      {hoverInfo && (
        <div
          className="pointer-events-none absolute z-20 rounded-lg border border-slate-700 bg-[#0A0F1C]/95 px-3 py-2 text-xs shadow-xl"
          style={{
            left: Math.min(hoverInfo.x + 14, (mountRef.current?.clientWidth || 600) - 210),
            top: Math.max(12, hoverInfo.y - 68),
          }}
        >
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-blue-400">#{hoverInfo.node.rank}</span>
            <span className="font-bold text-white">${hoverInfo.node.symbol}</span>
            <span
              className={`font-mono text-[11px] font-semibold ${
                hoverInfo.node.momentum1h >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {hoverInfo.node.momentum1h >= 0 ? '+' : ''}
              {hoverInfo.node.momentum1h.toFixed(1)}%
            </span>
          </div>
          <div className="mt-0.5 text-[10px] text-slate-400 truncate max-w-[180px]">
            {hoverInfo.node.name} · Click to inspect
          </div>
        </div>
      )}
    </div>
  );
};
