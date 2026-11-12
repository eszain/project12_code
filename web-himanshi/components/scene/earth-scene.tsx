"use client";

import { OrbitControls, Stars } from "@react-three/drei";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

const EARTH_TEXTURE = "/assets/earth/bluemarble-2048.png";
const EARTH_NIGHT_TEXTURE = "/assets/earth/earth_lights_2048.png";
const EARTH_CLOUD_TEXTURE = "/assets/earth/earth_clouds_1024.png";
const EARTH_NORMAL_TEXTURE = "/assets/earth/earth_normal_2048.jpg";
const SUN_DIRECTION = new THREE.Vector3(4, 2.5, 5).normalize();

function Atmosphere() {
  return (
    <mesh scale={1.035} renderOrder={2}>
      <sphereGeometry args={[1.25, 64, 64]} />
      <shaderMaterial
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        side={THREE.BackSide}
        vertexShader={`varying vec3 vWorldNormal; varying vec3 vWorldPosition; void main() { vWorldNormal = normalize(mat3(modelMatrix) * normal); vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`}
        fragmentShader={`varying vec3 vWorldNormal; varying vec3 vWorldPosition; void main() { vec3 viewDirection = normalize(cameraPosition - vWorldPosition); float facing = abs(dot(vWorldNormal, viewDirection)); float rim = pow(1.0 - facing, 3.4); float edgeFalloff = smoothstep(0.02, 0.92, rim); gl_FragColor = vec4(0.16, 0.58, 1.0, edgeFalloff * 0.42); }`}
      />
    </mesh>
  );
}

function CloudShell({ texture }: { texture: THREE.Texture }) {
  return (
    <mesh scale={1.014} renderOrder={1}>
      <sphereGeometry args={[1.25, 64, 64]} />
      <shaderMaterial
        transparent
        depthWrite={false}
        uniforms={{ map: { value: texture } }}
        vertexShader={`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`}
        fragmentShader={`uniform sampler2D map; varying vec2 vUv; void main() { vec4 cloud = texture2D(map, vUv); float alpha = smoothstep(0.08, 0.78, cloud.a) * 0.28; gl_FragColor = vec4(0.86, 0.96, 1.0, alpha); }`}
      />
    </mesh>
  );
}

type EarthDebugMode = "shader" | "day" | "night" | "cloud";

function Earth({ reducedMotion, debug }: { reducedMotion: boolean; debug: EarthDebugMode }) {
  const group = useRef<THREE.Group>(null);
  const [dayTexture, nightTexture, cloudTexture, normalTexture] = useLoader(THREE.TextureLoader, [EARTH_TEXTURE, EARTH_NIGHT_TEXTURE, EARTH_CLOUD_TEXTURE, EARTH_NORMAL_TEXTURE]);
  const uniforms = useMemo(() => ({
    dayMap: { value: dayTexture },
    nightMap: { value: nightTexture },
    normalMap: { value: normalTexture },
    sunDirection: { value: SUN_DIRECTION },
  }), [dayTexture, nightTexture, normalTexture]);

  dayTexture.colorSpace = THREE.SRGBColorSpace;
  nightTexture.colorSpace = THREE.SRGBColorSpace;
  cloudTexture.colorSpace = THREE.NoColorSpace;
  normalTexture.colorSpace = THREE.NoColorSpace;
  dayTexture.anisotropy = 4;
  nightTexture.anisotropy = 4;
  normalTexture.anisotropy = 4;

  useFrame((_, delta) => {
    if (group.current && !reducedMotion) group.current.rotation.y += delta * 0.055;
  });

  return (
    <group ref={group} scale={0.9}>
      <mesh>
        <sphereGeometry args={[1.25, 64, 64]} />
        {debug === "shader" ? (
          <shaderMaterial
            uniforms={uniforms}
            vertexShader={`varying vec2 vUv; varying vec3 vWorldNormal; varying vec3 vWorldPosition; void main() { vUv = uv; vWorldNormal = normalize(mat3(modelMatrix) * normal); vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`}
            fragmentShader={`uniform sampler2D dayMap; uniform sampler2D nightMap; uniform sampler2D normalMap; uniform vec3 sunDirection; varying vec2 vUv; varying vec3 vWorldNormal; varying vec3 vWorldPosition; void main() { vec3 surfaceNormal = normalize(vWorldNormal); vec3 reference = abs(surfaceNormal.y) > 0.92 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0); vec3 tangent = normalize(cross(reference, surfaceNormal)); vec3 bitangent = normalize(cross(surfaceNormal, tangent)); vec3 mapNormal = texture2D(normalMap, vUv).xyz * 2.0 - 1.0; surfaceNormal = normalize(surfaceNormal + (tangent * mapNormal.x + bitangent * mapNormal.y) * 0.055); float sun = dot(surfaceNormal, normalize(sunDirection)); float dayAmount = smoothstep(-0.16, 0.32, sun); float daylight = 0.5 + max(sun, 0.0) * 0.64; vec3 dayColor = sRGBTransferEOTF(texture2D(dayMap, vUv).rgb); vec3 cityLights = sRGBTransferEOTF(texture2D(nightMap, vUv).rgb); vec3 warmLights = cityLights * vec3(1.9, 1.15, 0.5); vec3 illuminatedDay = dayColor * daylight; vec3 nightBase = dayColor * 0.28; vec3 color = mix(nightBase + warmLights * 0.72, illuminatedDay + warmLights * 0.06, dayAmount); float limb = pow(1.0 - max(dot(surfaceNormal, normalize(cameraPosition - vWorldPosition)), 0.0), 2.2); color += vec3(0.015, 0.055, 0.1) * limb; gl_FragColor = vec4(color, 1.0); #include <tonemapping_fragment> #include <colorspace_fragment> }`}
          />
        ) : (
          <meshBasicMaterial map={debug === "night" ? nightTexture : dayTexture} toneMapped={false} />
        )}
      </mesh>
      {(debug === "cloud" || debug === "shader") && <CloudShell texture={cloudTexture} />}
      <Atmosphere />
    </group>
  );
}

function OrbitalRing({ radius, tilt, speed, color, reducedMotion, opacity = 0.5 }: { radius: number; tilt: number; speed: number; color: string; reducedMotion: boolean; opacity?: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => { if (ref.current && !reducedMotion) ref.current.rotation.z += delta * speed; });
  return <mesh ref={ref} rotation={[tilt, 0.2, 0]} renderOrder={0}><torusGeometry args={[radius, 0.003, 6, 160]} /><meshBasicMaterial color={color} transparent depthWrite={false} opacity={opacity * 0.82} /></mesh>;
}

function OrbitPoint({ radius, tilt, phase, speed, color, reducedMotion }: { radius: number; tilt: number; phase: number; speed: number; color: string; reducedMotion: boolean }) {
  const point = useRef<THREE.Mesh>(null);
  const angle = useRef(phase);
  useFrame((_, delta) => { if (!point.current) return; if (!reducedMotion) angle.current += delta * speed; point.current.position.set(Math.cos(angle.current) * radius, Math.sin(angle.current) * radius, 0); });
  return <group rotation={[tilt, 0.2, 0]}><mesh ref={point}><sphereGeometry args={[0.028, 12, 12]} /><meshBasicMaterial color={color} /></mesh></group>;
}

function Satellite({ reducedMotion, radius, tilt, phase, scale = 1 }: { reducedMotion: boolean; radius: number; tilt: number; phase: number; scale?: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, delta) => { if (ref.current && !reducedMotion) ref.current.rotation.y += delta * 0.15; });
  return (
    <group ref={ref} rotation={[tilt, 0.18, phase]} scale={scale}>
      <group position={[radius, 0, 0]} rotation={[0.2, 0.1, -0.15]}>
        <mesh><boxGeometry args={[0.17, 0.13, 0.13]} /><meshStandardMaterial color="#cfd9df" metalness={0.7} roughness={0.3} /></mesh>
        <mesh position={[0, 0, 0.072]}><boxGeometry args={[0.09, 0.075, 0.012]} /><meshStandardMaterial color="#e7a94a" metalness={0.4} roughness={0.38} /></mesh>
        {[-1, 1].map((side) => (
          <group key={side} position={[side * 0.25, 0, 0]}>
            <mesh><boxGeometry args={[0.29, 0.035, 0.13]} /><meshStandardMaterial color="#173a68" metalness={0.5} roughness={0.4} emissive="#08274c" emissiveIntensity={0.22} /></mesh>
            <mesh position={[0, -0.021, 0]}><boxGeometry args={[0.27, 0.006, 0.006]} /><meshBasicMaterial color="#7cc7ed" /></mesh>
            <mesh position={[0, 0.021, 0]}><boxGeometry args={[0.27, 0.006, 0.006]} /><meshBasicMaterial color="#7cc7ed" /></mesh>
          </group>
        ))}
        <mesh position={[0, 0.12, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.009, 0.009, 0.22, 12]} /><meshStandardMaterial color="#dbe7ed" metalness={0.6} roughness={0.3} /></mesh>
        <mesh position={[0, 0.235, 0]}><sphereGeometry args={[0.022, 12, 12]} /><meshBasicMaterial color="#8ee5ff" /></mesh>
        <mesh position={[0, -0.12, 0]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.055, 0.015, 0.055, 20, 1, true]} /><meshStandardMaterial color="#d5dde2" metalness={0.65} roughness={0.28} side={THREE.DoubleSide} /></mesh>
      </group>
    </group>
  );
}

function Debris({ reducedMotion }: { reducedMotion: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => { if (ref.current && !reducedMotion) { ref.current.rotation.x += delta * 0.8; ref.current.rotation.y += delta * 0.5; } });
  return <mesh ref={ref} position={[-1.72, 0.26, 0.18]} rotation={[0.4, 0.3, 0.2]}><dodecahedronGeometry args={[0.055, 0]} /><meshStandardMaterial color="#d99450" emissive="#6f2f0c" emissiveIntensity={0.55} roughness={0.75} /></mesh>;
}

function ConjunctionMarker({ reducedMotion }: { reducedMotion: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => { if (ref.current && !reducedMotion) ref.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 2.4) * 0.045); });
  return (
    <group ref={ref} position={[1.48, -0.02, 0.2]}>
      <mesh><sphereGeometry args={[0.03, 16, 16]} /><meshBasicMaterial color="#ff9b52" /></mesh>
      <mesh position={[0, 0, 0.01]}><boxGeometry args={[0.26, 0.012, 0.006]} /><meshBasicMaterial color="#ff7954" transparent opacity={0.48} /></mesh>
      <mesh position={[0, 0, 0.01]}><boxGeometry args={[0.012, 0.26, 0.006]} /><meshBasicMaterial color="#ff7954" transparent opacity={0.48} /></mesh>
      {[0.09, 0.145, 0.2].map((radius, index) => (
        <mesh key={radius} rotation={[Math.PI / 2, index * 0.15, 0]}><torusGeometry args={[radius, index === 0 ? 0.003 : 0.002, 8, 48]} /><meshBasicMaterial color={index === 2 ? "#ff9b5e" : "#ff624c"} transparent depthWrite={false} opacity={[0.8, 0.46, 0.24][index]} /></mesh>
      ))}
    </group>
  );
}

export function EarthScene() {
  const [webgl, setWebgl] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [earthDebug, setEarthDebug] = useState<EarthDebugMode>("shader");
  useEffect(() => {
    const canvas = document.createElement("canvas");
    setWebgl(Boolean(canvas.getContext("webgl") || canvas.getContext("experimental-webgl")));
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const requestedDebug = new URLSearchParams(window.location.search).get("earthDebug");
    if (requestedDebug === "day" || requestedDebug === "night" || requestedDebug === "cloud" || requestedDebug === "shader") setEarthDebug(requestedDebug);
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  if (!webgl) return <div className="scene-fallback" role="img" aria-label="Orbital visualization unavailable"><span className="fallback-orbit" /><span>Orbital visualization unavailable</span></div>;
  return (
    <Canvas camera={{ position: [0, 0, 5], fov: 48 }} dpr={[1, 1.35]} gl={{ antialias: true, alpha: true }} onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.15; }}>
      <ambientLight intensity={0.6} color="#a5c7dc" />
      <hemisphereLight args={["#b4e2ff", "#07111d", 0.9]} />
      <directionalLight position={[4, 2.5, 5]} intensity={2.75} color="#fff8e9" />
      <pointLight position={[-3, -1, 2]} intensity={0.28} color="#276b98" />
      <Stars radius={8} depth={5} count={560} factor={1.4} saturation={0} fade speed={reducedMotion ? 0 : 0.12} />
      <Earth reducedMotion={reducedMotion} debug={earthDebug} />
      <OrbitalRing radius={1.58} tilt={0.6} speed={0.14} color="#4fd4ff" reducedMotion={reducedMotion} />
      <OrbitalRing radius={1.86} tilt={-0.45} speed={-0.09} color="#8274ff" reducedMotion={reducedMotion} opacity={0.62} />
      <OrbitalRing radius={2.08} tilt={0.2} speed={0.06} color="#4fd4ff" reducedMotion={reducedMotion} opacity={0.34} />
      <OrbitPoint radius={1.58} tilt={0.6} phase={0.4} speed={0.14} color="#6ee0ff" reducedMotion={reducedMotion} />
      <OrbitPoint radius={1.86} tilt={-0.45} phase={2.4} speed={-0.09} color="#a99bff" reducedMotion={reducedMotion} />
      <OrbitPoint radius={2.08} tilt={0.2} phase={4.4} speed={0.06} color="#6ee0ff" reducedMotion={reducedMotion} />
      <Satellite reducedMotion={reducedMotion} radius={1.86} tilt={0.57} phase={0.18} scale={0.95} />
      <Satellite reducedMotion={reducedMotion} radius={2.12} tilt={-0.42} phase={3.4} scale={0.72} />
      <Debris reducedMotion={reducedMotion} />
      <ConjunctionMarker reducedMotion={reducedMotion} />
      <OrbitControls enableZoom={false} enablePan={false} autoRotate={!reducedMotion} autoRotateSpeed={0.25} />
    </Canvas>
  );
}
