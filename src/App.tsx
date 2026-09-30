import { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, Line, OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';

type DisplayMode = 'cartoon' | 'surface' | 'atoms';
type Residue = { id: number; code: string; name: string; x: number; y: number; z: number; color: string; role: 'active' | 'support' | 'loop' };
type Atom = { id: string; element: 'C' | 'N' | 'O' | 'S'; x: number; y: number; z: number; color: string; radius: number };
const residues: Residue[] = [
  { id: 41, code: 'GLU41', name: '谷氨酸', x: -1.6, y: .4, z: .5, color: '#ef8e77', role: 'active' },
  { id: 78, code: 'TYR78', name: '酪氨酸', x: -.7, y: 1.15, z: -.25, color: '#f0c76e', role: 'support' },
  { id: 102, code: 'HIS102', name: '组氨酸', x: .4, y: .75, z: .2, color: '#71c9e6', role: 'active' },
  { id: 146, code: 'ASP146', name: '天冬氨酸', x: 1.2, y: .15, z: -.45, color: '#e88389', role: 'active' },
  { id: 183, code: 'PHE183', name: '苯丙氨酸', x: 1.8, y: .7, z: .35, color: '#c28ce8', role: 'support' },
  { id: 219, code: 'SER219', name: '丝氨酸', x: .55, y: -.3, z: -.65, color: '#8fd6a2', role: 'loop' },
  { id: 244, code: 'GLY244', name: '甘氨酸', x: -1.05, y: -.55, z: -.3, color: '#9aabb4', role: 'loop' }
];
const ligandAtoms: Atom[] = [
  { id: 'C1', element: 'C', x: 0, y: 0, z: 0, color: '#d6e1e4', radius: .17 },
  { id: 'C2', element: 'C', x: .55, y: .26, z: .08, color: '#d6e1e4', radius: .17 },
  { id: 'N1', element: 'N', x: .98, y: -.18, z: .18, color: '#54b9e3', radius: .2 },
  { id: 'O1', element: 'O', x: -.48, y: .35, z: .05, color: '#ec7474', radius: .18 },
  { id: 'O2', element: 'O', x: -.15, y: -.5, z: -.1, color: '#ec7474', radius: .18 },
  { id: 'S1', element: 'S', x: .42, y: .05, z: -.62, color: '#e7c35f', radius: .24 }
];
const bonds: [string, string][] = [['C1','C2'],['C1','O1'],['C1','O2'],['C2','N1'],['C2','S1']];
const helixPoints = Array.from({ length: 46 }, (_, index) => { const t = index / 45; return new THREE.Vector3(-3.2 + t * 6.4, Math.sin(t * Math.PI * 4) * .72 + Math.cos(t * Math.PI * 2) * .18, Math.cos(t * Math.PI * 3) * .74); });
const sheetPoints = Array.from({ length: 22 }, (_, index) => new THREE.Vector3(-3.5 + index * .33, 1.4 + Math.sin(index * .55) * .16, -.9 + Math.sin(index * .55) * .25));
const makeBond = (a: THREE.Vector3, b: THREE.Vector3) => [a, b];
function Ligand({ rotation, selectedAtom, onSelect }: { rotation: number; selectedAtom: string; onSelect: (id: string) => void }) {
  const positions = useMemo(() => Object.fromEntries(ligandAtoms.map(atom => [atom.id, new THREE.Vector3(atom.x, atom.y, atom.z)])), []);
  return <group position={[.1, .45, .15]} rotation={[0, rotation, 0]}>{bonds.map(([from, to]) => <Line key={`${from}-${to}`} points={makeBond(positions[from], positions[to])} color="#cbd9dc" lineWidth={3} />)}{ligandAtoms.map(atom => <mesh key={atom.id} position={[atom.x, atom.y, atom.z]} onClick={(event) => { event.stopPropagation(); onSelect(atom.id); }}><sphereGeometry args={[atom.radius * (selectedAtom === atom.id ? 1.35 : 1), 16, 12]} /><meshStandardMaterial color={atom.color} emissive={selectedAtom === atom.id ? atom.color : '#000000'} emissiveIntensity={selectedAtom === atom.id ? .7 : 0} /></mesh>)}</group>;
}
function ProteinSurface() {
  // Marching cubes 场域：内部坐标 [0,1] 映射到以 SURFACE_CENTER 为中心、边长 2*SURFACE_SCALE 的世界区域
  const SURFACE_SCALE = 4;
  const SURFACE_CENTER: [number, number, number] = [0, .25, 0];
  const RESOLUTION = 144;
  const MAX_POLY_COUNT = 180000;
  // 等值面世界半径 R（Å）→ addBall 强度：iso=80、subtract=12 时 strength = (92/(2·SCALE)²)·R²
  const ballStrength = (worldRadius: number) => (92 / (4 * SURFACE_SCALE * SURFACE_SCALE)) * worldRadius * worldRadius;
  const surfaceBalls = useMemo(() => {
    type SurfaceBall = { x: number; y: number; z: number; radius: number; color: THREE.Color };
    const balls: SurfaceBall[] = [];
    const backbone: { point: THREE.Vector3; color: THREE.Color }[] = [];
    const addBackbone = (points: THREE.Vector3[], radius: number, hex: string) => {
      const color = new THREE.Color(hex);
      points.forEach(point => {
        backbone.push({ point, color });
        balls.push({ x: point.x, y: point.y, z: point.z, radius, color });
      });
    };
    addBackbone(helixPoints, .26, '#6b9fe9');
    addBackbone(sheetPoints, .3, '#d58acb');
    residues.forEach(residue => {
      const residueColor = new THREE.Color(residue.color);
      const end = new THREE.Vector3(residue.x, residue.y, residue.z);
      let anchor = backbone[0];
      let anchorDistance = Infinity;
      backbone.forEach(item => { const distance = item.point.distanceTo(end); if (distance < anchorDistance) { anchorDistance = distance; anchor = item; } });
      const steps = 4;
      const mixed = new THREE.Color();
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const position = anchor.point.clone().lerp(end, t);
        mixed.copy(anchor.color).lerp(residueColor, t);
        balls.push({ x: position.x, y: position.y, z: position.z, radius: i === steps ? .38 : .22, color: mixed.clone() });
      }
    });
    return balls;
  }, []);
  const mesh = useMemo(() => {
    const material = new THREE.MeshPhysicalMaterial({ vertexColors: true, transparent: true, opacity: .62, roughness: .28, metalness: .04, clearcoat: .5, clearcoatRoughness: .35, side: THREE.DoubleSide });
    const marchingCubes = new MarchingCubes(RESOLUTION, material, false, true, MAX_POLY_COUNT);
    marchingCubes.reset();
    surfaceBalls.forEach(ball => {
      marchingCubes.addBall(.5 + (ball.x - SURFACE_CENTER[0]) / (2 * SURFACE_SCALE), .5 + (ball.y - SURFACE_CENTER[1]) / (2 * SURFACE_SCALE), .5 + (ball.z - SURFACE_CENTER[2]) / (2 * SURFACE_SCALE), ballStrength(ball.radius), 12, ball.color);
    });
    marchingCubes.update();
    marchingCubes.position.set(...SURFACE_CENTER);
    marchingCubes.scale.setScalar(SURFACE_SCALE);
    marchingCubes.frustumCulled = false;
    // 表面不拦截指针事件，残基/配体点击选择可穿透
    marchingCubes.raycast = () => {};
    return marchingCubes;
  }, [surfaceBalls]);
  useEffect(() => () => { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }, [mesh]);
  return <primitive object={mesh} />;
}
function ProteinModel({ displayMode, selectedResidue, setSelectedResidue, ligandRotation, selectedAtom, setSelectedAtom }: { displayMode: DisplayMode; selectedResidue: number; setSelectedResidue: (id: number) => void; ligandRotation: number; selectedAtom: string; setSelectedAtom: (id: string) => void }) {
  const showAtoms = displayMode === 'atoms';
  const surface = displayMode === 'surface';
  return <Canvas shadows camera={{ position: [8, 5.5, 9], fov: 40 }}><color attach="background" args={['#09151d']} /><ambientLight intensity={1.2} /><directionalLight position={[5, 8, 5]} intensity={2.4} castShadow /><pointLight position={[-4, 3, 3]} color="#7fe0ff" intensity={18} distance={11} />
    <group rotation={[.08, -.25, 0]}>{showAtoms && residues.map(residue => <mesh key={residue.id} position={[residue.x, residue.y, residue.z]}><sphereGeometry args={[.22, 12, 10]} /><meshStandardMaterial color={residue.color} /></mesh>)}{!showAtoms && !surface && <><Line points={helixPoints} color="#6b9fe9" lineWidth={5} /> <Line points={sheetPoints} color="#d58acb" lineWidth={6} /></>}{surface && <ProteinSurface />}{residues.map(residue => <group key={`res-${residue.id}`} position={[residue.x, residue.y, residue.z]}><mesh onClick={(event) => { event.stopPropagation(); setSelectedResidue(residue.id); }}><sphereGeometry args={[selectedResidue === residue.id ? .28 : .18, 16, 12]} /><meshStandardMaterial color={residue.color} emissive={selectedResidue === residue.id ? residue.color : '#000'} emissiveIntensity={selectedResidue === residue.id ? .8 : 0} transparent opacity={surface ? .9 : 1} /></mesh><Text position={[0, .43, 0]} fontSize={.14} color={selectedResidue === residue.id ? '#ffe9a2' : '#8baeb9'} anchorX="center">{residue.code}</Text></group>)}<Ligand rotation={ligandRotation} selectedAtom={selectedAtom} onSelect={setSelectedAtom} /></group><ContactShadows position={[0, -1.5, 0]} opacity={.32} scale={10} blur={2.5} /><OrbitControls makeDefault minDistance={5} maxDistance={16} /></Canvas>;
}
function Metric({ label, value, note }: { label: string; value: string; note: string }) { return <div className="metric"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>; }
export default function App() {
  const [mode, setMode] = useState<DisplayMode>('cartoon');
  const [selectedResidue, setSelectedResidue] = useState(102);
  const [selectedAtom, setSelectedAtom] = useState('N1');
  const [ligandRotation, setLigandRotation] = useState(0.2);
  const [showInteractions, setShowInteractions] = useState(true);
  const residue = residues.find(item => item.id === selectedResidue) ?? residues[2];
  const interactionLines = useMemo(() => residues.filter(item => item.role === 'active').map(item => [new THREE.Vector3(item.x, item.y, item.z), new THREE.Vector3(item.x * .38, item.y * .34 + .4, item.z * .38)] as [THREE.Vector3, THREE.Vector3]), []);
  return <div className="app"><header className="topbar"><div className="brand"><div className="brand-icon">P</div><div><span className="eyebrow">STRUCTURAL BIOLOGY / ANALYSIS WORKSPACE</span><h1>Protein Atlas <span>·</span> 配体结合可视化</h1></div></div><div className="header-meta"><span className="dataset">PDB-LITE / 1MOL</span><button onClick={() => setShowInteractions(value => !value)}>{showInteractions ? '隐藏相互作用' : '显示相互作用'}</button><button onClick={() => setLigandRotation(value => value + .35)}>旋转配体 ↻</button></div></header><main className="layout"><section className="model-card"><div className="model-head"><div><span className="eyebrow">MOLECULAR VIEWER</span><h2>蛋白质结合口袋 · Ligand LIG-17</h2></div><div className="mode-switch">{(['cartoon','surface','atoms'] as DisplayMode[]).map(item => <button key={item} className={mode === item ? 'active' : ''} onClick={() => setMode(item)}>{item === 'cartoon' ? '卡通带状' : item === 'surface' ? '表面模型' : '原子视图'}</button>)}</div></div><div className="canvas-wrap"><ProteinModel displayMode={mode} selectedResidue={selectedResidue} setSelectedResidue={setSelectedResidue} ligandRotation={ligandRotation} selectedAtom={selectedAtom} setSelectedAtom={setSelectedAtom} />{showInteractions && interactionLines.map((points, index) => <div key={index} />)}<div className="viewer-legend"><span><i className="dot protein" />蛋白骨架</span><span><i className="dot ligand" />配体原子</span><span><i className="dot interaction" />相互作用</span></div><div className="viewer-hint">左键旋转 · 滚轮缩放 · 点击残基或原子</div></div></section><aside className="sidebar"><section className="panel intro-panel"><span className="eyebrow">ACTIVE SITE</span><h3>结合口袋分析</h3><p>当前模型显示 7 个关键残基和一个小分子配体。通过选择残基查看空间关系与作用类型。</p><div className="metrics"><Metric label="口袋体积" value="486 Å³" note="预测区域" /><Metric label="结合残基" value="5" note="3 active / 2 support" /><Metric label="氢键" value="4" note="几何筛选" /></div></section><section className="panel"><div className="panel-title"><div><span className="eyebrow">RESIDUES</span><h3>关键残基</h3></div><span className="count">{residues.length}</span></div><div className="residue-list">{residues.map(item => <button key={item.id} className={selectedResidue === item.id ? 'residue selected' : 'residue'} onClick={() => setSelectedResidue(item.id)}><span className="residue-color" style={{ background: item.color }} /><span><b>{item.code}</b><small>{item.name}</small></span><em>{item.role === 'active' ? 'ACTIVE' : item.role === 'support' ? 'SUPPORT' : 'LOOP'}</em></button>)}</div></section><section className="panel detail-panel"><span className="eyebrow">SELECTED RESIDUE</span><div className="detail-title"><h3>{residue.code}</h3><span>{residue.name}</span></div><div className="detail-grid"><div><span>空间坐标</span><b>{residue.x.toFixed(2)} / {residue.y.toFixed(2)} / {residue.z.toFixed(2)} Å</b></div><div><span>残基角色</span><b>{residue.role === 'active' ? '结合活性位点' : residue.role === 'support' ? '口袋支撑' : '柔性环区'}</b></div><div><span>配体距离</span><b>{(1.9 + residue.id % 6 * .22).toFixed(2)} Å</b></div><div><span>相互作用</span><b>{residue.role === 'active' ? '氢键 / 极性' : '范德华力'}</b></div></div></section><section className="panel atom-panel"><span className="eyebrow">LIGAND ATOM</span><div className="atom-row"><span className="atom-badge">{selectedAtom.slice(0,1)}</span><div><b>{selectedAtom}</b><small>点击模型中的原子切换</small></div><span className="atom-value">{selectedAtom === 'N1' ? '供体' : selectedAtom.startsWith('O') ? '受体' : '骨架'}</span></div></section></aside></main></div>;
}
