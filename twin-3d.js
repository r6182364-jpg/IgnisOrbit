import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas = document.querySelector('#twinCanvas');
const stage = document.querySelector('#stationMap');
const loading = document.querySelector('#sceneLoading');

if (!canvas || !stage) throw new Error('3D viewport canvas was not found.');

const scene = new THREE.Scene();
scene.background = new THREE.Color('#edf4ef');
scene.fog = new THREE.Fog('#edf4ef', 12, 25);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
camera.position.set(8.2, 6.8, 10.5);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.3, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 7;
controls.maxDistance = 18;
controls.maxPolarAngle = Math.PI * 0.48;

scene.add(new THREE.HemisphereLight('#f3fff8', '#65766d', 2.1));
const keyLight = new THREE.DirectionalLight('#fff8e9', 3.2);
keyLight.position.set(5, 8, 6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
scene.add(keyLight);
const fillLight = new THREE.PointLight('#7fc6a2', 32, 18);
fillLight.position.set(-5, 3, 2);
scene.add(fillLight);

const materials = {
  shell: new THREE.MeshStandardMaterial({ color: '#b7c8bf', metalness: 0.72, roughness: 0.35, transparent: true, opacity: 0.48, side: THREE.DoubleSide }),
  edge: new THREE.LineBasicMaterial({ color: '#668276', transparent: true, opacity: 0.72 }),
  floor: new THREE.MeshStandardMaterial({ color: '#a9b9b0', metalness: 0.7, roughness: 0.43 }),
  panel: new THREE.MeshStandardMaterial({ color: '#e3ebe5', metalness: 0.55, roughness: 0.4 }),
  battery: new THREE.MeshStandardMaterial({ color: '#c77c51', metalness: 0.62, roughness: 0.34 }),
  electronics: new THREE.MeshStandardMaterial({ color: '#638b83', metalness: 0.65, roughness: 0.3 }),
  crew: new THREE.MeshStandardMaterial({ color: '#d4ddd6', metalness: 0.38, roughness: 0.48 }),
  sensor: new THREE.MeshStandardMaterial({ color: '#5cb78a', emissive: '#1e6942', emissiveIntensity: 1.5, metalness: 0.2, roughness: 0.25 }),
  oxygen: new THREE.MeshStandardMaterial({ color: '#86b6a1', metalness: 0.7, roughness: 0.26 }),
  dark: new THREE.MeshStandardMaterial({ color: '#35443e', metalness: 0.6, roughness: 0.36 }),
  fire: new THREE.MeshBasicMaterial({ color: '#ef8553', transparent: true, opacity: 0.94 }),
  route: new THREE.MeshBasicMaterial({ color: '#e68156', transparent: true, opacity: 0.82 })
};

const selectable = new Map();
const sensorMeshes = [];
const fireParticles = [];
let trajectoryMesh;
let fireCore;
let fireLight;
let fireOrigin = 'battery';
let visualFireScale = 1;
let lastWidth = 0;
let lastHeight = 0;

function box(name, size, position, material, parent = scene, selection = null) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  if (selection) selectable.set(selection, mesh);
  return mesh;
}

function cylinder(name, radiusTop, radiusBottom, height, position, material, parent = scene, rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 20), material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function addEdges(mesh, color = '#687c72', opacity = 0.4) {
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
  edges.position.copy(mesh.position);
  edges.rotation.copy(mesh.rotation);
  edges.scale.copy(mesh.scale);
  scene.add(edges);
}

const room = new THREE.Group();
scene.add(room);
const floor = box('Cabin floor', [8.4, 0.24, 5.2], [0, 0, 0], materials.floor, room);
addEdges(floor, '#6c8176', 0.52);
const ceiling = box('Open cutaway ceiling', [8.4, 0.14, 5.2], [0, 3.6, 0], materials.shell, room);
addEdges(ceiling, '#688378', 0.54);
for (const x of [-4.1, 4.1]) {
  const wall = box('Cabin bulkhead', [0.15, 3.6, 5.1], [x, 1.8, 0], materials.shell, room);
  addEdges(wall, '#627a6d', 0.65);
}
const backWall = box('Cabin equipment wall', [8.3, 3.6, 0.14], [0, 1.8, -2.52], materials.shell, room);
addEdges(backWall, '#627a6d', 0.62);

for (let x = -3.4; x <= 3.5; x += 1.1) {
  box('Wall equipment rail', [0.08, 3.2, 0.12], [x, 1.8, -2.38], materials.dark, room);
}
for (let y = 0.48; y < 3.4; y += 0.48) {
  box('Wall panel seam', [7.8, 0.035, 0.035], [0, y, -2.3], materials.dark, room);
}

const workBench = box('Workstation', [2.7, 0.16, 1.25], [-2.45, 1.12, -0.95], materials.panel, room);
box('Bench leg', [0.12, 1.05, 0.12], [-3.5, 0.58, -0.95], materials.dark, room);
box('Bench leg', [0.12, 1.05, 0.12], [-1.4, 0.58, -0.95], materials.dark, room);
box('Electronics rack', [1.25, 1.05, 0.82], [-2.7, 1.77, -1.45], materials.electronics, room, 'electronics');
box('Electronics display', [0.76, 0.42, 0.07], [-2.7, 2.2, -1.0], materials.dark, room);
for (let index = 0; index < 4; index += 1) {
  const light = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.055, 0.025), materials.sensor);
  light.position.set(-2.94 + index * 0.16, 2.2, -0.95);
  room.add(light);
}

const batteryRack = box('Battery enclosure', [1.05, 0.82, 0.78], [-3.05, 0.62, 0.55], materials.battery, room, 'battery');
box('Battery safety cover', [1.2, 0.1, 0.92], [-3.05, 1.08, 0.55], materials.dark, room);
for (let index = 0; index < 3; index += 1) {
  box('Battery cell', [0.24, 0.52, 0.49], [-3.35 + index * 0.3, 0.64, 0.55], materials.panel, room);
}

const crewZone = box('Crew berth', [1.4, 0.32, 2.1], [2.65, 0.9, -1.25], materials.crew, room, 'crew');
box('Berth cushion', [1.28, 0.15, 1.95], [2.65, 1.13, -1.25], materials.panel, room);
box('Crew storage', [1.22, 0.75, 0.7], [2.65, 1.72, -1.98], materials.crew, room);
box('Equipment cabinet', [1.35, 1.35, 0.95], [3.0, 0.83, 1.0], materials.panel, room);

const pipePoints = [new THREE.Vector3(-0.85, 2.55, -2.18), new THREE.Vector3(-0.85, 2.55, 0.15), new THREE.Vector3(0.05, 2.55, 0.7), new THREE.Vector3(1.25, 2.55, 0.7), new THREE.Vector3(1.25, 2.55, -2.18)];
const oxygenPipe = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pipePoints), 64, 0.07, 10, false), materials.oxygen);
oxygenPipe.name = 'Oxygen distribution pipe';
room.add(oxygenPipe);
selectable.set('oxygen', oxygenPipe);

const flowFan = cylinder('Air circulation fan', 0.48, 0.48, 0.16, [0, 2.95, -2.2], materials.dark, room);
for (let index = 0; index < 4; index += 1) {
  const blade = box('Fan blade', [0.48, 0.045, 0.1], [0, 2.95, -2.1], materials.panel, room);
  blade.rotation.z = index * Math.PI / 2;
}

for (const [name, position] of [['THERMAL', [-3.3, 2.7, 0.25]], ['GAS', [0.3, 2.95, -0.8]], ['OPTICAL', [2.8, 2.7, 0.2]], ['PRESSURE', [0.4, 1.8, 1.85]]]) {
  const housing = cylinder(`${name} sensor housing`, 0.11, 0.13, 0.1, position, materials.dark, room);
  housing.rotation.x = Math.PI / 2;
  const sensor = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), materials.sensor);
  sensor.position.set(position[0], position[1], position[2] + 0.08);
  sensor.name = name;
  room.add(sensor);
  sensorMeshes.push(sensor);
}

const grid = new THREE.GridHelper(18, 30, '#9db8a8', '#d2ded5');
grid.position.y = -0.19;
grid.material.transparent = true;
grid.material.opacity = 0.28;
scene.add(grid);

const fireGroup = new THREE.Group();
fireGroup.visible = false;
scene.add(fireGroup);
fireCore = new THREE.Mesh(new THREE.SphereGeometry(0.14, 18, 14), materials.fire);
fireCore.scale.set(0.75, 1.5, 0.75);
fireGroup.add(fireCore);
fireLight = new THREE.PointLight('#fa7b43', 0, 8);
fireGroup.add(fireLight);
for (let index = 0; index < 18; index += 1) {
  const particle = new THREE.Mesh(new THREE.SphereGeometry(0.035 + Math.random() * 0.045, 8, 6), new THREE.MeshBasicMaterial({ color: index % 3 ? '#f7ac59' : '#e35d3e', transparent: true, opacity: 0.72 }));
  particle.userData.phase = Math.random() * Math.PI * 2;
  fireGroup.add(particle);
  fireParticles.push(particle);
}

function clearTrajectory() {
  if (!trajectoryMesh) return;
  fireGroup.remove(trajectoryMesh);
  trajectoryMesh.geometry.dispose();
  trajectoryMesh = undefined;
}

function setFire(source, risk = 30) {
  fireOrigin = source in Object.fromEntries([...selectable.keys()].map((key) => [key, true])) ? source : 'battery';
  const sourceMesh = selectable.get(fireOrigin) || batteryRack;
  room.updateMatrixWorld(true);
  sourceMesh.getWorldPosition(fireGroup.position);
  fireGroup.position.y += 0.52;
  fireGroup.visible = true;
  visualFireScale = 1;
  fireCore.scale.set(0.75, 1.5, 0.75);
  fireLight.intensity = 2.2 + risk / 12;
  materials.fire.color.set(risk >= 60 ? '#e34f3b' : '#ed8550');
  clearTrajectory();
  const sourcePoint = fireGroup.position.clone();
  const points = [sourcePoint, sourcePoint.clone().add(new THREE.Vector3(0.2, 0.4, 0)), new THREE.Vector3(0.7, 1.1, 0.2), new THREE.Vector3(1.6, 1.38, 0.35), new THREE.Vector3(2.45, 1.45, 0.05)];
  trajectoryMesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 60, 0.035, 8, false), materials.route);
  fireGroup.add(trajectoryMesh);
  document.querySelector('#sceneMode').textContent = 'DEMO VISUAL';
  document.querySelectorAll('.hotspot').forEach((hotspot) => hotspot.setAttribute('aria-pressed', String(hotspot.dataset.module === source)));
}

function clearFire() {
  fireGroup.visible = false;
  visualFireScale = 1;
  clearTrajectory();
  document.querySelector('#sceneMode').textContent = 'HISTORICAL DATA';
  document.querySelectorAll('.hotspot').forEach((hotspot) => hotspot.setAttribute('aria-pressed', 'false'));
}

function setObservedFlame({ areaPercent = 0, extentPercent = 0, brightness = 0 }) {
  clearTrajectory();
  document.querySelectorAll('.hotspot').forEach((hotspot) => hotspot.setAttribute('aria-pressed', 'false'));
  if (areaPercent <= 0 || brightness <= 0) {
    fireGroup.visible = false;
    document.querySelector('#sceneMode').textContent = 'NO WARM PIXELS';
    return;
  }
  fireGroup.position.set(0, 0.35, 0.1);
  fireGroup.visible = true;
  visualFireScale = THREE.MathUtils.clamp(0.55 + Math.sqrt(areaPercent) / 5 + extentPercent / 160, 0.65, 2.2);
  fireCore.scale.set(0.75 * visualFireScale, 1.3 * visualFireScale, 0.75 * visualFireScale);
  fireLight.intensity = 0.35 + THREE.MathUtils.clamp(brightness / 255, 0, 1) * 2.2;
  materials.fire.color.set('#ed8550');
  document.querySelector('#sceneMode').textContent = 'SIGNATURE PREVIEW';
}

function setEnvironment(kind) {
  const configurations = {
    station: { scale: [1, 1, 1], camera: [8.2, 6.8, 10.5], target: [0, 1.3, 0] },
    vehicle: { scale: [0.78, 0.92, 0.82], camera: [7.3, 6.2, 10.8], target: [0, 1.25, 0] },
    lab: { scale: [1.06, 1.02, 0.95], camera: [9.4, 7.8, 11.8], target: [0, 1.35, 0] }
  };
  const configuration = configurations[kind] || configurations.station;
  room.scale.set(...configuration.scale);
  camera.position.set(...configuration.camera);
  controls.target.set(...configuration.target);
  controls.update();
}

function selectPart(name) {
  const mesh = selectable.get(name);
  if (!mesh) return;
  const original = mesh.userData.originalColor || mesh.material.color?.clone();
  if (original) mesh.userData.originalColor = original;
  for (const item of selectable.values()) {
    if (item.material?.emissive) item.material.emissive.set('#000000');
  }
  if (mesh.material?.emissive) mesh.material.emissive.set('#367e5f');
  document.querySelectorAll('.hotspot').forEach((hotspot) => hotspot.setAttribute('aria-pressed', String(hotspot.dataset.module === name)));
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
renderer.domElement.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  const bounds = renderer.domElement.getBoundingClientRect();
  pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects([...selectable.values()], false);
  if (hits.length) selectPart([...selectable.entries()].find(([, mesh]) => mesh === hits[0].object)?.[0]);
});

document.querySelectorAll('.hotspot').forEach((hotspot) => {
  hotspot.addEventListener('click', () => selectPart(hotspot.dataset.module));
});

function resize(force = false) {
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  if (!width || !height || (!force && width === lastWidth && height === lastHeight)) return;
  lastWidth = width;
  lastHeight = height;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

new ResizeObserver(resize).observe(stage);
window.addEventListener('resize', () => resize(true));
resize();
loading.hidden = true;
window.spaceFireTwin3D = { setFire, clearFire, setObservedFlame, selectPart, setEnvironment };

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();
  resize();
  controls.update();
  sensorMeshes.forEach((sensor, index) => {
    sensor.material.emissiveIntensity = 1.2 + Math.sin(elapsed * 2.1 + index * 1.6) * 0.42;
  });
  fireCore.scale.y = (1.42 + Math.sin(elapsed * 8) * 0.2) * visualFireScale;
  fireParticles.forEach((particle) => {
    const phase = (elapsed * 0.62 + particle.userData.phase) % 1;
    particle.position.set(Math.sin(particle.userData.phase * 4 + elapsed) * 0.18, phase * 1.45, Math.cos(particle.userData.phase * 3 + elapsed) * 0.14);
    particle.material.opacity = fireGroup.visible ? (1 - phase) * 0.74 : 0;
  });
  renderer.render(scene, camera);
}
animate();

window.addEventListener('beforeunload', () => {
  renderer.dispose();
  controls.dispose();
});
