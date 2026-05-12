/*
  =========================================================
  TALK' STUDIO - WORKSPACE BUILD CONTROLLER
  ---------------------------------------------------------
  This module controls the interactive 3D build workspace.

  It uses:
  - Three.js for browser-based 3D rendering.
  - OrbitControls for camera movement.
  - HTML drag-and-drop for adding shapes and components.
  - Pointer events for selecting and moving placed 3D objects.
  - localStorage for saving the current prototype state.

  The onboarding popup has intentionally been removed because
  it was blocking user interaction on the workspace.
  =========================================================
*/

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";


/* =========================================================
   1. SAFE PROJECT STORAGE HELPERS
   ---------------------------------------------------------
   The workspace normally uses app-state.js. These fallback
   helpers prevent the workspace from crashing if app-state.js
   is missing or not loaded during testing.
   ========================================================= */

const STORAGE_KEY = "talkStudioProjects";
const ACTIVE_PROJECT_KEY = "talkStudioActiveProjectId";

function safeLoadProjects() {
  if (typeof window.loadProjects === "function") {
    return window.loadProjects();
  }

  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function safeSaveProjects(projects) {
  if (typeof window.saveProjects === "function") {
    window.saveProjects(projects);
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

function safeCreateNewProject() {
  if (typeof window.createNewProject === "function") {
    return window.createNewProject();
  }

  const project = {
    id: crypto.randomUUID(),
    name: `Prototype ${new Date().toLocaleDateString()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    objects: [],
    background: ""
  };

  const projects = safeLoadProjects();
  projects.unshift(project);
  safeSaveProjects(projects);
  localStorage.setItem(ACTIVE_PROJECT_KEY, project.id);

  return project;
}

function safeGetActiveProject() {
  if (typeof window.getActiveProject === "function") {
    return window.getActiveProject();
  }

  const activeId = localStorage.getItem(ACTIVE_PROJECT_KEY);
  const projects = safeLoadProjects();

  return projects.find((project) => project.id === activeId) || null;
}


/* =========================================================
   2. PROJECT STATE
   ---------------------------------------------------------
   The active project links the workspace to the project
   directory. If the page is opened directly, a project is
   created automatically.
   ========================================================= */

let activeProject = safeGetActiveProject();

if (!activeProject) {
  activeProject = safeCreateNewProject();
}

let selectedBodyColour = "#D95A00";
let selectedComponentColour = "#7897DF";
let selectedObject = null;
let draggedAsset = null;

const sceneObjects = [];

let isMovingObject = false;
let hasPointerMoved = false;

const dragPlane = new THREE.Plane();
const dragStartPoint = new THREE.Vector3();
const dragOffset = new THREE.Vector3();
const dragIntersection = new THREE.Vector3();


/* =========================================================
   3. DOM REFERENCES
   ---------------------------------------------------------
   These references connect the JavaScript logic to the HTML
   controls and panels.
   ========================================================= */

const stage = document.getElementById("threeStage");
const emptyHint = document.getElementById("emptyHint");
const simulateBtn = document.getElementById("simulateBtn");

const quickEditPanel = document.getElementById("quickEditPanel");
const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");
const trashZone = document.getElementById("trashZone");

const scaleXControl = document.getElementById("scaleXControl");
const scaleYControl = document.getElementById("scaleYControl");
const scaleZControl = document.getElementById("scaleZControl");
const rotateXControl = document.getElementById("rotateXControl");
const rotateYControl = document.getElementById("rotateYControl");
const rotateZControl = document.getElementById("rotateZControl");
const layerControl = document.getElementById("layerControl");


/* =========================================================
   4. THREE.JS SCENE SETUP
   ---------------------------------------------------------
   Three.js creates the 3D design area inside the workspace
   stage. The renderer uses transparency so the canvas blends
   with the soft pink interface background.
   ========================================================= */

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  45,
  stage.clientWidth / stage.clientHeight,
  0.1,
  100
);

camera.position.set(0, 2.2, 7);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true
});

renderer.setSize(stage.clientWidth, stage.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

stage.appendChild(renderer.domElement);

/*
  OrbitControls creates familiar 3D navigation:
  - left drag on empty space rotates the view,
  - right drag pans the view,
  - scroll zooms in and out.
*/
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 0, 0);

/*
  Lighting creates glossy, rounded highlights on the shapes.
  This makes the prototype look less flat and more like a
  product mock-up.
*/
scene.add(new THREE.AmbientLight(0xffffff, 0.85));

const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
keyLight.position.set(4, 7, 5);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xffe4f0, 1.25);
fillLight.position.set(-4, 2.5, 3);
scene.add(fillLight);

const highlightLight = new THREE.PointLight(0xfff0b8, 1.8);
highlightLight.position.set(0, 2.6, 3.5);
scene.add(highlightLight);

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();


/* =========================================================
   5. MATERIAL HELPERS
   ---------------------------------------------------------
   These helpers create reusable glossy materials for body
   shapes and components.
   ========================================================= */

function createBodyMaterial(colour) {
  return new THREE.MeshPhysicalMaterial({
    color: colour,
    roughness: 0.16,
    metalness: 0.06,
    clearcoat: 0.85,
    clearcoatRoughness: 0.14
  });
}

function createComponentMaterial(colour) {
  return new THREE.MeshPhysicalMaterial({
    color: colour,
    roughness: 0.22,
    metalness: 0.05,
    clearcoat: 0.65,
    clearcoatRoughness: 0.2
  });
}

function createDarkFrameMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: "#4a2b1d",
    roughness: 0.25,
    metalness: 0.12,
    clearcoat: 0.35
  });
}


/* =========================================================
   6. CANVAS TEXTURE HELPERS
   ---------------------------------------------------------
   Canvas textures are used to draw recognisable icons and LCD
   screen text onto 3D surfaces.
   ========================================================= */

function createSymbolTexture(symbol) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;

  const context = canvas.getContext("2d");

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#ffffff";
  context.font = "bold 110px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(symbol, 128, 132);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  return texture;
}

function createScreenTextTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;

  const context = canvas.getContext("2d");

  context.clearRect(0, 0, canvas.width, canvas.height);

  const gradient = context.createRadialGradient(256, 128, 10, 256, 128, 210);
  gradient.addColorStop(0, "rgba(255, 245, 96, 0.95)");
  gradient.addColorStop(0.45, "rgba(160, 140, 34, 0.88)");
  gradient.addColorStop(1, "rgba(52, 42, 14, 0.85)");

  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = "rgba(255,255,255,0.85)";
  context.font = "bold 34px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("voice journal...", 256, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  return texture;
}


/* =========================================================
   7. GEOMETRY HELPERS
   ---------------------------------------------------------
   Each body part button maps to a different Three.js geometry.
   The doodle tool is represented as a 3D tube curve so it can
   suggest tails, handles, arms, waves, or decorative marks.
   ========================================================= */

function createShapeGeometry(type) {
  if (type === "sphere") {
    return new THREE.SphereGeometry(1, 64, 64);
  }

  if (type === "box") {
    return new THREE.BoxGeometry(1.8, 1.2, 1.2);
  }

  if (type === "cylinder") {
    return new THREE.CylinderGeometry(0.75, 0.75, 1.6, 64);
  }

  if (type === "cone") {
    return new THREE.ConeGeometry(0.9, 1.7, 64);
  }

  if (type === "capsule") {
    return new THREE.CapsuleGeometry(0.55, 1.25, 12, 48);
  }

  if (type === "torus") {
    return new THREE.TorusGeometry(0.85, 0.22, 24, 96);
  }

  if (type === "doodle") {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.1, -0.2, 0),
      new THREE.Vector3(-0.55, 0.35, 0),
      new THREE.Vector3(0.1, -0.18, 0),
      new THREE.Vector3(0.85, 0.32, 0)
    ]);

    return new THREE.TubeGeometry(curve, 80, 0.08, 16, false);
  }

  return new THREE.BoxGeometry(1, 1, 1);
}

function getButtonSymbol(type) {
  const symbols = {
    play: "▶",
    pause: "Ⅱ",
    skip: "▶▏",
    rewind: "↺",
    mute: "🔈",
    delete: "⌫"
  };

  return symbols[type] || "";
}


/* =========================================================
   8. COMPONENT CREATION
   ---------------------------------------------------------
   Components are modelled as small 3D elements that can be
   placed onto or around the main body shape.
   ========================================================= */

function createMicrophoneMesh(colour) {
  const group = new THREE.Group();

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 40, 40),
    createComponentMaterial(colour)
  );

  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.045, 0.35, 32),
    createComponentMaterial(colour)
  );

  stem.position.y = -0.28;

  group.add(head);
  group.add(stem);

  return group;
}

function createScreenMesh() {
  const screenGroup = new THREE.Group();

  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(1.18, 0.58, 0.14),
    createDarkFrameMaterial()
  );

  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(0.96, 0.38),
    new THREE.MeshBasicMaterial({
      map: createScreenTextTexture(),
      transparent: true
    })
  );

  glass.position.z = 0.08;

  screenGroup.add(frame);
  screenGroup.add(glass);

  return screenGroup;
}

function createButtonMesh(type, colour) {
  const group = new THREE.Group();

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.28, 0.12, 48),
    createComponentMaterial(colour)
  );

  base.rotation.x = Math.PI / 2;

  const iconFace = new THREE.Mesh(
    new THREE.CircleGeometry(0.21, 48),
    new THREE.MeshBasicMaterial({
      map: createSymbolTexture(getButtonSymbol(type)),
      transparent: true
    })
  );

  iconFace.position.z = 0.07;

  group.add(base);
  group.add(iconFace);

  return group;
}

function createLCDText(text) {
  /*
    LCD text texture.
    A canvas is used because it allows simple readable text to be converted
    into a Three.js texture without requiring an external image file.
  */
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;

  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = "rgba(246, 240, 200, 0.95)";
  context.font = "bold 42px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 256, 132);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  return new THREE.Mesh(
    new THREE.PlaneGeometry(1.18, 0.36),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false
    })
  );
}

function createMicIconTexture() {
  /*
    Microphone icon texture.
    The icon is drawn directly on a canvas to avoid relying on external
    image files. The simple line style keeps the component readable at
    small scale inside the 3D workspace.
  */
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;

  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, 256, 256);
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#ffffff";
  ctx.lineWidth = 14;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.roundRect(92, 42, 72, 104, 34);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(72, 108);
  ctx.quadraticCurveTo(72, 172, 128, 172);
  ctx.quadraticCurveTo(184, 172, 184, 108);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(128, 172);
  ctx.lineTo(128, 208);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(96, 208);
  ctx.lineTo(160, 208);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  return texture;
}

function createComponentMesh(type, colour = selectedComponentColour) {
  if (type === "mic") {
  /*
    Microphone button component.
    This component represents voice input as a flat physical button.
    A circular raised button is used because it is easier to place on
    different product bodies than a standing microphone form.
  */
  const micGroup = new THREE.Group();

  const button = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.28, 0.12, 48),
    createComponentMaterial(selectedComponentColour)
  );

  button.rotation.x = Math.PI / 2;

  /*
    Microphone icon surface.
    The icon is drawn as a canvas texture so the component remains fully
    code-based and does not require an external image asset.
  */
  const icon = new THREE.Mesh(
    new THREE.CircleGeometry(0.21, 48),
    new THREE.MeshBasicMaterial({
      map: createMicIconTexture(),
      transparent: true,
      depthWrite: false
    })
  );

  icon.position.z = 0.07;

  micGroup.add(button);
  micGroup.add(icon);

  micGroup.userData.kind = "component";
  micGroup.userData.type = "mic";

  return micGroup;
}

  if (type === "screen") {
  /*
    LCD screen component.
    This component represents the voice-journaling display module.
    The structure uses a raised outer frame, recessed glass surface,
    warm internal light, readable display text, and a subtle reflection
    layer to match the earlier visual design language of the prototype.
  */
  const screenGroup = new THREE.Group();

  /*
    Outer screen frame.
    A dark brown material is used to make the LCD appear embedded and
    physically separate from the product body.
  */
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(1.55, 0.72, 0.11),
    new THREE.MeshPhysicalMaterial({
      color: 0x6a3f30,
      roughness: 0.22,
      metalness: 0.18,
      clearcoat: 1
    })
  );

  /*
    Recessed glass display.
    The display surface is darker than the frame and uses a controlled
    emissive value so the screen glows without becoming visually washed out.
  */
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(1.28, 0.46, 0.13),
    new THREE.MeshPhysicalMaterial({
      color: 0x2f2508,
      roughness: 0.04,
      metalness: 0.2,
      clearcoat: 1,
      emissive: 0xffcd36,
      emissiveIntensity: 0.25
    })
  );

  glass.position.z = 0.08;

  /*
    Internal LCD light.
    The point light creates the warm yellow glow visible from the display,
    similar to the earlier prototype version.
  */
  const glow = new THREE.PointLight(0xffcd36, 1.7, 2.6);
  glow.position.set(0, 0, 0.36);

  /*
    Display text.
    The text is drawn to a canvas texture and placed slightly in front of
    the glass surface so it reads like content shown on the LCD.
  */
  const textPlane = createLCDText("voice journal...");
  textPlane.position.set(0, 0, 0.17);


  /*
    Screen reflection.
    A semi-transparent white plane gives the LCD a glossy highlight,
    making it look closer to the original display design.
  */
  const reflection = new THREE.Mesh(
    new THREE.PlaneGeometry(0.55, 0.15),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.14,
      depthWrite: false
    })
  );

  reflection.position.set(-0.32, 0.18, 0.19);
  reflection.rotation.z = -0.2;

  screenGroup.add(frame);
  screenGroup.add(glass);
  screenGroup.add(textPlane);
  screenGroup.add(reflection);
  screenGroup.add(glow);

  screenGroup.userData.kind = "component";
  screenGroup.userData.type = "screen";

  return screenGroup;
}

  return createButtonMesh(type, colour);
}


/* =========================================================
   9. OBJECT REGISTRATION AND METADATA
   ---------------------------------------------------------
   Metadata stored in userData makes it possible to select,
   edit, save, validate, and duplicate objects.
   ========================================================= */

function registerSceneObject(object, metadata) {
  object.userData.id = metadata.id || crypto.randomUUID();
  object.userData.kind = metadata.kind;
  object.userData.type = metadata.type;
  object.userData.colour = metadata.colour || null;

  scene.add(object);
  sceneObjects.push(object);

  return object;
}

function getPrimaryBodyShape() {
  return sceneObjects.find((object) => object.userData.kind === "shape") || null;
}

function hasUniqueComponent(type) {
  return sceneObjects.some((object) => object.userData.type === type);
}

function isSingleUseComponent(type) {
  return ["mic", "play", "pause", "skip", "rewind", "mute", "delete"].includes(type);
}


/* =========================================================
   10. ADDING SHAPES AND COMPONENTS
   ---------------------------------------------------------
   Shapes can be added freely. Components require at least one
   body shape because the prototype must have a product body
   before controls can be placed.
   ========================================================= */

function addBodyShape(type, options = {}) {
  const colour = options.colour || selectedBodyColour;

  const mesh = new THREE.Mesh(
    createShapeGeometry(type),
    createBodyMaterial(colour)
  );

  mesh.position.set(
    options.position?.x ?? ((Math.random() - 0.5) * 1.2),
    options.position?.y ?? 0,
    options.position?.z ?? 0
  );

  mesh.rotation.set(
    options.rotation?.x ?? 0,
    options.rotation?.y ?? 0,
    options.rotation?.z ?? 0
  );

  mesh.scale.set(
    options.scale?.x ?? 1,
    options.scale?.y ?? 1,
    options.scale?.z ?? 1
  );

  registerSceneObject(mesh, {
    id: options.id,
    kind: "shape",
    type,
    colour
  });

  selectObject(mesh);
  updateEmptyHint();
  saveWorkspaceState();

  return mesh;
}

function addComponent(type, options = {}) {
  const bodyShape = getPrimaryBodyShape();

  if (!bodyShape && !options.restoring) {
    alert("Add a body shape first before placing components.");
    return null;
  }

  if (!options.restoring && isSingleUseComponent(type) && hasUniqueComponent(type)) {
    alert("Only one of this component can be added to the prototype.");
    return null;
  }

  const colour = options.colour || selectedComponentColour;
  const component = createComponentMesh(type, colour);

  const basePosition = bodyShape ? bodyShape.position : new THREE.Vector3(0, 0, 0);

  component.position.set(
    options.position?.x ?? basePosition.x + 0.55,
    options.position?.y ?? basePosition.y + 0.1,
    options.position?.z ?? basePosition.z + 1.15
  );

  component.rotation.set(
    options.rotation?.x ?? 0,
    options.rotation?.y ?? 0,
    options.rotation?.z ?? 0
  );

  component.scale.set(
    options.scale?.x ?? 1,
    options.scale?.y ?? 1,
    options.scale?.z ?? 1
  );

  registerSceneObject(component, {
    id: options.id,
    kind: "component",
    type,
    colour
  });

  selectObject(component);
  updateEmptyHint();
  saveWorkspaceState();

  return component;
}


/* =========================================================
   11. SELECTION AND EDITING
   ---------------------------------------------------------
   Selecting an object displays the quick edit panel. The
   sliders directly update scale, rotation, and front/back
   placement.
   ========================================================= */

function selectObject(object) {
  selectedObject = object;

  quickEditPanel.classList.add("visible");

  scaleXControl.value = object.scale.x;
  scaleYControl.value = object.scale.y;
  scaleZControl.value = object.scale.z;

  rotateXControl.value = THREE.MathUtils.radToDeg(object.rotation.x);
  rotateYControl.value = THREE.MathUtils.radToDeg(object.rotation.y);
  rotateZControl.value = THREE.MathUtils.radToDeg(object.rotation.z);

  layerControl.value = object.position.z;
}

function clearSelection() {
  selectedObject = null;
  quickEditPanel.classList.remove("visible");
}

function updateSelectedObjectFromSliders() {
  if (!selectedObject) return;

  selectedObject.scale.set(
    Number(scaleXControl.value),
    Number(scaleYControl.value),
    Number(scaleZControl.value)
  );

  selectedObject.rotation.x = THREE.MathUtils.degToRad(Number(rotateXControl.value));
  selectedObject.rotation.y = THREE.MathUtils.degToRad(Number(rotateYControl.value));
  selectedObject.rotation.z = THREE.MathUtils.degToRad(Number(rotateZControl.value));

  selectedObject.position.z = Number(layerControl.value);

  saveWorkspaceState();
}

[
  scaleXControl,
  scaleYControl,
  scaleZControl,
  rotateXControl,
  rotateYControl,
  rotateZControl,
  layerControl
].forEach((control) => {
  control.addEventListener("input", updateSelectedObjectFromSliders);
});


/* =========================================================
   12. COLOUR APPLICATION
   ---------------------------------------------------------
   Colour selection affects new objects and also recolours the
   currently selected object when the selected object type
   matches the colour group.
   ========================================================= */

function applyColourToObject(object, colour) {
  if (!object) return;

  object.userData.colour = colour;

  object.traverse((child) => {
    if (child.isMesh && child.material && child.material.color) {
      child.material.color.set(colour);
    }
  });
}

function setActiveBodyPreviewColour(colour) {
  document.documentElement.style.setProperty("--active-body-colour", colour);
}

document.querySelectorAll(".colour-dot").forEach((button) => {
  button.addEventListener("click", () => {
    selectedBodyColour = button.dataset.colour;
    setActiveBodyPreviewColour(selectedBodyColour);

    document.querySelectorAll(".colour-dot").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");

    if (selectedObject && selectedObject.userData.kind === "shape") {
      applyColourToObject(selectedObject, selectedBodyColour);
      saveWorkspaceState();
    }
  });
});

document.getElementById("customBodyColour").addEventListener("input", (event) => {
  selectedBodyColour = event.target.value;
  setActiveBodyPreviewColour(selectedBodyColour);

  if (selectedObject && selectedObject.userData.kind === "shape") {
    applyColourToObject(selectedObject, selectedBodyColour);
    saveWorkspaceState();
  }
});

document.querySelectorAll(".component-colour-dot").forEach((button) => {
  button.addEventListener("click", () => {
    selectedComponentColour = button.dataset.colour;

    document.querySelectorAll(".component-colour-dot").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");

    if (selectedObject && selectedObject.userData.kind === "component" && selectedObject.userData.type !== "screen") {
      applyColourToObject(selectedObject, selectedComponentColour);
      saveWorkspaceState();
    }
  });
});


/* =========================================================
   13. DELETE AND DUPLICATE
   ---------------------------------------------------------
   Objects can be deleted from the quick panel, trash button,
   clear-all control, or by dragging over the trash zone.
   ========================================================= */

function deleteObject(object) {
  if (!object) return;

  scene.remove(object);

  const index = sceneObjects.indexOf(object);

  if (index !== -1) {
    sceneObjects.splice(index, 1);
  }

  if (selectedObject === object) {
    clearSelection();
  }

  updateEmptyHint();
  saveWorkspaceState();
}

function deleteSelectedObject() {
  deleteObject(selectedObject);
}

function duplicateSelectedObject() {
  if (!selectedObject) {
    alert("Select an item first before duplicating.");
    return;
  }

  const source = selectedObject;
  const duplicateData = {
    type: source.userData.type,
    colour: source.userData.colour,
    position: {
      x: source.position.x + 0.35,
      y: source.position.y + 0.25,
      z: source.position.z
    },
    rotation: {
      x: source.rotation.x,
      y: source.rotation.y,
      z: source.rotation.z
    },
    scale: {
      x: source.scale.x,
      y: source.scale.y,
      z: source.scale.z
    }
  };

  if (source.userData.kind === "shape") {
    addBodyShape(source.userData.type, duplicateData);
  } else {
    addComponent(source.userData.type, {
      ...duplicateData,
      restoring: true
    });
  }
}

deleteSelectedBtn.addEventListener("click", deleteSelectedObject);
trashZone.addEventListener("click", deleteSelectedObject);
document.getElementById("duplicateBtn").addEventListener("click", duplicateSelectedObject);


/* =========================================================
   14. POINTER SELECTION AND OBJECT MOVEMENT
   ---------------------------------------------------------
   Pointer events let users click an object to select it and
   drag it around the stage. Empty-space dragging remains
   controlled by OrbitControls.
   ========================================================= */

function updateMouseFromEvent(event) {
  const rect = renderer.domElement.getBoundingClientRect();

  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function getSelectableObject(intersectionObject) {
  let object = intersectionObject;

  while (object.parent && !object.userData.id) {
    object = object.parent;
  }

  return object;
}

function getIntersectedObject(event) {
  updateMouseFromEvent(event);
  raycaster.setFromCamera(mouse, camera);

  const intersections = raycaster.intersectObjects(sceneObjects, true);

  if (intersections.length === 0) {
    return null;
  }

  return getSelectableObject(intersections[0].object);
}

function isPointerOverTrash(event) {
  const rect = trashZone.getBoundingClientRect();

  return (
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom
  );
}

renderer.domElement.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;

  const object = getIntersectedObject(event);

  if (!object) {
    clearSelection();
    return;
  }

  selectObject(object);

  dragPlane.setFromNormalAndCoplanarPoint(
    camera.getWorldDirection(new THREE.Vector3()).negate(),
    object.position
  );

  raycaster.ray.intersectPlane(dragPlane, dragStartPoint);
  dragOffset.copy(dragStartPoint).sub(object.position);

  isMovingObject = true;
  hasPointerMoved = false;

  controls.enabled = false;
  renderer.domElement.setPointerCapture(event.pointerId);
});

renderer.domElement.addEventListener("pointermove", (event) => {
  if (!isMovingObject || !selectedObject) return;

  updateMouseFromEvent(event);
  raycaster.setFromCamera(mouse, camera);

  if (raycaster.ray.intersectPlane(dragPlane, dragIntersection)) {
    const nextPosition = dragIntersection.sub(dragOffset);

    selectedObject.position.set(
      nextPosition.x,
      nextPosition.y,
      nextPosition.z
    );

    layerControl.value = selectedObject.position.z;

    hasPointerMoved = true;
    trashZone.classList.toggle("delete-ready", isPointerOverTrash(event));
  }
});

renderer.domElement.addEventListener("pointerup", (event) => {
  if (isMovingObject && selectedObject && isPointerOverTrash(event)) {
    deleteSelectedObject();
  } else if (hasPointerMoved) {
    saveWorkspaceState();
  }

  isMovingObject = false;
  hasPointerMoved = false;

  trashZone.classList.remove("delete-ready");
  controls.enabled = true;
});

renderer.domElement.addEventListener("pointercancel", () => {
  isMovingObject = false;
  hasPointerMoved = false;

  trashZone.classList.remove("delete-ready");
  controls.enabled = true;
});


/* =========================================================
   15. TOOLKIT DRAG AND DROP
   ---------------------------------------------------------
   Users can drag assets from the right panel into the 3D
   workspace. A simple click also adds the item for faster
   testing during development.
   ========================================================= */

document.querySelectorAll(".draggable-asset").forEach((asset) => {
  asset.addEventListener("dragstart", (event) => {
    draggedAsset = {
      kind: asset.dataset.kind,
      type: asset.dataset.type
    };

    event.dataTransfer.setData("text/plain", JSON.stringify(draggedAsset));
  });

  asset.addEventListener("click", () => {
    if (asset.dataset.kind === "shape") {
      addBodyShape(asset.dataset.type);
    }

    if (asset.dataset.kind === "component") {
      addComponent(asset.dataset.type);
    }
  });
});

stage.addEventListener("dragover", (event) => {
  event.preventDefault();
});

stage.addEventListener("drop", (event) => {
  event.preventDefault();

  if (!draggedAsset) return;

  if (draggedAsset.kind === "shape") {
    addBodyShape(draggedAsset.type);
  }

  if (draggedAsset.kind === "component") {
    addComponent(draggedAsset.type);
  }

  draggedAsset = null;
});


/* =========================================================
   16. BACKGROUND SELECTION
   ---------------------------------------------------------
   Background tiles update both the panel preview and the
   design stage background.
   ========================================================= */

document.querySelectorAll(".background-tile").forEach((tile) => {
  const backgroundPath = tile.dataset.bg;

  if (backgroundPath) {
    tile.style.backgroundImage = `url("${backgroundPath}")`;
  }

  tile.addEventListener("click", () => {
    document.querySelectorAll(".background-tile").forEach((item) => {
      item.classList.remove("active");
    });

    tile.classList.add("active");

    if (!backgroundPath) {
      stage.style.backgroundImage = "";
      stage.style.backgroundSize = "";
      stage.style.backgroundPosition = "";
    } else {
      stage.style.backgroundImage = `url("${backgroundPath}")`;
      stage.style.backgroundSize = "cover";
      stage.style.backgroundPosition = "center";
    }

    activeProject.background = backgroundPath;
    saveWorkspaceState();
  });
});


/* =========================================================
   17. TOOLBAR CONTROLS
   ---------------------------------------------------------
   The bottom toolbar provides camera and project-level actions.
   ========================================================= */

document.getElementById("resetViewBtn").addEventListener("click", () => {
  camera.position.set(0, 2.2, 7);
  controls.target.set(0, 0, 0);
  controls.update();
});

document.getElementById("zoomInBtn").addEventListener("click", () => {
  camera.position.multiplyScalar(0.86);
  controls.update();
});

document.getElementById("zoomOutBtn").addEventListener("click", () => {
  camera.position.multiplyScalar(1.14);
  controls.update();
});

document.getElementById("viewRoomBtn").addEventListener("click", () => {
  camera.position.set(0, 1.4, 5.2);
  controls.target.set(0, 0, 0);
  controls.update();
});

document.getElementById("fullscreenBtn").addEventListener("click", () => {
  if (!document.fullscreenElement) {
    stage.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
});

document.getElementById("clearBtn").addEventListener("click", () => {
  const confirmClear = confirm("Clear all objects from this prototype?");

  if (!confirmClear) return;

  [...sceneObjects].forEach((object) => {
    scene.remove(object);
  });

  sceneObjects.length = 0;

  clearSelection();
  updateEmptyHint();
  saveWorkspaceState();
});


/* =========================================================
   18. SIMULATION VALIDATION
   ---------------------------------------------------------
   The simulate button only becomes meaningful after the model
   has the minimum required voice-journaling elements:
   one body shape, one microphone, and one LCD screen.
   ========================================================= */

function canSimulate() {
  const hasShape = sceneObjects.some((object) => object.userData.kind === "shape");
  const hasMic = sceneObjects.some((object) => object.userData.type === "mic");
  const hasScreen = sceneObjects.some((object) => object.userData.type === "screen");

  return hasShape && hasMic && hasScreen;
}

function updateSimulationButton() {
  simulateBtn.classList.toggle("muted", !canSimulate());
}

simulateBtn.addEventListener("click", () => {
  if (!canSimulate()) {
    alert("To simulate, add at least one body shape, one microphone, and one LCD screen.");
    return;
  }

  saveWorkspaceState();
  window.location.href = "simulate.html";
});


/* =========================================================
   19. ACCORDION BEHAVIOUR
   ---------------------------------------------------------
   Only one panel section is open at a time so the right-side
   toolkit remains readable.
   ========================================================= */

document.querySelectorAll(".workspace-panel-title").forEach((titleButton) => {
  titleButton.addEventListener("click", () => {
    const selectedSection = titleButton.closest(".workspace-panel-section");
    const isOpen = selectedSection.classList.contains("open");

    document.querySelectorAll(".workspace-panel-section").forEach((section) => {
      section.classList.remove("open");

      const arrow = section.querySelector("strong");
      if (arrow) arrow.textContent = "▼";
    });

    if (!isOpen) {
      selectedSection.classList.add("open");

      const arrow = titleButton.querySelector("strong");
      if (arrow) arrow.textContent = "▲";
    }
  });
});


/* =========================================================
   20. SAVE AND RESTORE
   ---------------------------------------------------------
   The scene is saved as simplified object data. This keeps
   projects lightweight while preserving shape type, component
   type, position, rotation, scale, colour, and background.
   ========================================================= */

function serialiseObject(object) {
  return {
    id: object.userData.id,
    kind: object.userData.kind,
    type: object.userData.type,
    colour: object.userData.colour,
    position: {
      x: object.position.x,
      y: object.position.y,
      z: object.position.z
    },
    rotation: {
      x: object.rotation.x,
      y: object.rotation.y,
      z: object.rotation.z
    },
    scale: {
      x: object.scale.x,
      y: object.scale.y,
      z: object.scale.z
    }
  };
}

function saveWorkspaceState() {
  const projects = safeLoadProjects();
  const projectIndex = projects.findIndex((project) => project.id === activeProject.id);

  if (projectIndex === -1) return;

  projects[projectIndex].updatedAt = new Date().toISOString();
  projects[projectIndex].background = activeProject.background || "";
  projects[projectIndex].objects = sceneObjects.map(serialiseObject);

  safeSaveProjects(projects);
  updateSimulationButton();
}

function restoreWorkspaceState() {
  if (activeProject.background) {
    stage.style.backgroundImage = `url("${activeProject.background}")`;
    stage.style.backgroundSize = "cover";
    stage.style.backgroundPosition = "center";

    document.querySelectorAll(".background-tile").forEach((tile) => {
      tile.classList.toggle("active", tile.dataset.bg === activeProject.background);
    });
  }

  if (!Array.isArray(activeProject.objects)) return;

  activeProject.objects.forEach((objectData) => {
    if (objectData.kind === "shape") {
      addBodyShape(objectData.type, {
        ...objectData,
        restoring: true
      });
    }

    if (objectData.kind === "component") {
      addComponent(objectData.type, {
        ...objectData,
        restoring: true
      });
    }
  });

  clearSelection();
}


/* =========================================================
   21. EMPTY STATE AND RENDERING
   ---------------------------------------------------------
   The empty message is hidden once the user adds objects.
   The animation loop updates OrbitControls and redraws the
   Three.js scene every frame.
   ========================================================= */

function updateEmptyHint() {
  emptyHint.style.display = sceneObjects.length > 0 ? "none" : "flex";
}

window.addEventListener("resize", () => {
  camera.aspect = stage.clientWidth / stage.clientHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(stage.clientWidth, stage.clientHeight);
});

function animate() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}


/* =========================================================
   22. INITIALISATION
   ---------------------------------------------------------
   These calls prepare the workspace after all functions and
   event listeners have been registered.
   ========================================================= */

setActiveBodyPreviewColour(selectedBodyColour);
restoreWorkspaceState();
updateEmptyHint();
updateSimulationButton();
animate();