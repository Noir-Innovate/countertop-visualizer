"use client";

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useTexture } from "@react-three/drei";
import * as THREE from "three";
import type { CountertopPiece } from "@/lib/designer-types";
import {
  pieceToPolygon,
  transformPolygon,
  cabinetRunFromLength,
  polygonCentroid,
  CABINET_DEPTH,
  CABINET_HEIGHT,
} from "@/lib/designer-types";
import type { Slab } from "@/lib/types";

interface Scene3DProps {
  pieces: CountertopPiece[];
  slab: Slab | null;
  cabinetStyle: "shaker" | "flat";
  cabinetColor: string;
}

const THICKNESS = 1.25;

type CabinetBox = {
  position: [number, number, number];
  size: [number, number, number];
  rotation: number;
};

function buildCabinetBoxes(pieces: CountertopPiece[]): CabinetBox[] {
  const boxes: CabinetBox[] = [];

  for (const piece of pieces) {
    const localPoints = pieceToPolygon(piece);
    const worldPoints = transformPolygon(
      localPoints,
      piece.position,
      piece.rotation,
    );
    const centroid = polygonCentroid(worldPoints);

    for (let i = 0; i < worldPoints.length; i++) {
      const p1 = worldPoints[i];
      const p2 = worldPoints[(i + 1) % worldPoints.length];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 6) continue;

      const edgeMidX = (p1.x + p2.x) / 2;
      const edgeMidY = (p1.y + p2.y) / 2;
      // Outward = from centroid to edge (cabinet sits against wall, outside polygon)
      const toEdgeX = edgeMidX - centroid.x;
      const toEdgeY = edgeMidY - centroid.y;
      const perpLen = Math.sqrt(toEdgeX * toEdgeX + toEdgeY * toEdgeY) || 1;
      const perpX = toEdgeX / perpLen;
      const perpY = toEdgeY / perpLen;
      // Cabinet center: halfway from edge toward wall (cabinet back on edge, front toward room)
      const inset = CABINET_DEPTH / 2;

      const runWidths = cabinetRunFromLength(len);
      const angle = Math.atan2(dy, dx);
      let runOffset = 0;

      for (const cw of runWidths) {
        const mid = runOffset + cw / 2;
        const boxCx = p1.x + (dx / len) * mid + perpX * inset;
        const boxCy = p1.y + (dy / len) * mid + perpY * inset;
        boxes.push({
          position: [-boxCx, -CABINET_HEIGHT / 2, -boxCy],
          size: [cw, CABINET_HEIGHT, CABINET_DEPTH],
          rotation: -angle,
        });
        runOffset += cw;
      }
    }
  }
  return boxes;
}

function CountertopMeshPlain({ pieces }: { pieces: CountertopPiece[] }) {
  const { geometries } = useMemo(() => {
    const geoms: {
      geometry: THREE.BufferGeometry;
      position: [number, number, number];
      rotation: number;
    }[] = [];

    for (const piece of pieces) {
      const localPoints = pieceToPolygon(piece);
      const worldPoints = transformPolygon(
        localPoints,
        piece.position,
        piece.rotation,
      );
      if (worldPoints.length < 3) continue;

      const shape = new THREE.Shape();
      shape.moveTo(worldPoints[0].x, worldPoints[0].y);
      for (let i = 1; i < worldPoints.length; i++) {
        shape.lineTo(worldPoints[i].x, worldPoints[i].y);
      }
      shape.closePath();

      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: THICKNESS,
        bevelEnabled: false,
      });

      let minX = Infinity,
        maxX = -Infinity,
        minZ = Infinity,
        maxZ = -Infinity;
      worldPoints.forEach((p) => {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minZ = Math.min(minZ, p.y);
        maxZ = Math.max(maxZ, p.y);
      });
      const cx = (minX + maxX) / 2;
      const cz = (minZ + maxZ) / 2;

      geoms.push({
        geometry,
        position: [-cx, THICKNESS / 2, -cz],
        rotation: 0,
      });
    }

    return { geometries: geoms };
  }, [pieces]);

  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: 0xd4d4d8,
        roughness: 0.4,
        metalness: 0.05,
      }),
    [],
  );

  return (
    <>
      {geometries.map((g, i) => (
        <mesh
          key={i}
          geometry={g.geometry}
          material={mat}
          position={[g.position[0], g.position[1], g.position[2]]}
          rotation={[-Math.PI / 2, 0, 0]}
        />
      ))}
    </>
  );
}

function CountertopMeshTextured({
  pieces,
  textureUrl,
}: {
  pieces: CountertopPiece[];
  textureUrl: string;
}) {
  const texture = useTexture(textureUrl);

  const { geometries } = useMemo(() => {
    const geoms: {
      geometry: THREE.BufferGeometry;
      position: [number, number, number];
    }[] = [];

    for (const piece of pieces) {
      const localPoints = pieceToPolygon(piece);
      const worldPoints = transformPolygon(
        localPoints,
        piece.position,
        piece.rotation,
      );
      if (worldPoints.length < 3) continue;

      const shape = new THREE.Shape();
      shape.moveTo(worldPoints[0].x, worldPoints[0].y);
      for (let i = 1; i < worldPoints.length; i++) {
        shape.lineTo(worldPoints[i].x, worldPoints[i].y);
      }
      shape.closePath();

      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: THICKNESS,
        bevelEnabled: false,
      });

      let minX = Infinity,
        maxX = -Infinity,
        minZ = Infinity,
        maxZ = -Infinity;
      worldPoints.forEach((p) => {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minZ = Math.min(minZ, p.y);
        maxZ = Math.max(maxZ, p.y);
      });
      const cx = (minX + maxX) / 2;
      const cz = (minZ + maxZ) / 2;

      geoms.push({
        geometry,
        position: [-cx, THICKNESS / 2, -cz],
      });
    }
    return { geometries: geoms };
  }, [pieces]);

  const mat = useMemo(() => {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(0.02, 0.02);
    return new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.3,
      metalness: 0.05,
    });
  }, [texture]);

  return (
    <>
      {geometries.map((g, i) => (
        <mesh
          key={i}
          geometry={g.geometry}
          material={mat}
          position={[g.position[0], g.position[1], g.position[2]]}
          rotation={[-Math.PI / 2, 0, 0]}
        />
      ))}
    </>
  );
}

function CabinetBoxes({
  pieces,
  color,
}: {
  pieces: CountertopPiece[];
  color: string;
}) {
  const r = parseInt(color.slice(1, 3), 16) / 255;
  const g = parseInt(color.slice(3, 5), 16) / 255;
  const b = parseInt(color.slice(5, 7), 16) / 255;

  const boxes = useMemo(() => buildCabinetBoxes(pieces), [pieces]);

  return (
    <>
      {boxes.map((box, i) => (
        <mesh
          key={i}
          position={box.position}
          rotation={[0, box.rotation, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={box.size} />
          <meshStandardMaterial
            color={new THREE.Color(r, g, b)}
            roughness={0.8}
          />
        </mesh>
      ))}
    </>
  );
}

function SceneContent(props: Scene3DProps) {
  const centroid = useMemo((): [number, number, number] => {
    if (props.pieces.length === 0) return [0, 0, 0];
    let sx = 0,
      sy = 0;
    let n = 0;
    for (const p of props.pieces) {
      const pts = transformPolygon(pieceToPolygon(p), p.position, p.rotation);
      pts.forEach((pt) => {
        sx += pt.x;
        sy += pt.y;
        n++;
      });
    }
    return [-sx / n, 0, -sy / n];
  }, [props.pieces]);

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[80, 100, 80]} intensity={1} castShadow />
      <directionalLight position={[-40, 60, -40]} intensity={0.3} />
      <OrbitControls
        enablePan
        enableZoom
        minDistance={20}
        maxDistance={300}
        target={centroid}
      />
      {props.slab?.imageUrl ? (
        <CountertopMeshTextured
          pieces={props.pieces}
          textureUrl={props.slab.imageUrl}
        />
      ) : (
        <CountertopMeshPlain pieces={props.pieces} />
      )}
      <CabinetBoxes pieces={props.pieces} color={props.cabinetColor} />
    </>
  );
}

export default function Scene3D(props: Scene3DProps) {
  return (
    <div className="w-full h-full min-h-[500px]">
      <Canvas
        shadows
        camera={{ position: [120, 80, 120], fov: 45 }}
        gl={{ antialias: true }}
      >
        <Suspense fallback={null}>
          <SceneContent {...props} />
        </Suspense>
      </Canvas>
    </div>
  );
}
