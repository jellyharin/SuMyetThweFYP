/*
  Application state manager.

  This file manages prototype project storage for Talk' Studio.
  localStorage is used because the prototype is designed to run as a
  static browser-based system without requiring a backend database.
*/

/* Defines the storage key for all saved prototype projects. */
const PROJECT_STORAGE_KEY = "talkStudioProjects";

/* Defines the storage key for the currently opened project. */
const ACTIVE_PROJECT_KEY = "talkStudioActiveProject";

/* 
  Loads all saved projects from localStorage.
  An empty array is returned when no projects exist.
*/
function loadProjects() {
  const savedProjects = localStorage.getItem(PROJECT_STORAGE_KEY);

  if (!savedProjects) {
    return [];
  }

  return JSON.parse(savedProjects);
}

/* 
  Saves the full project array to localStorage.
  This allows project cards to remain available after refresh.
*/
function saveProjects(projects) {
  localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(projects));
}

/* 
  Generates a simple project name.
  The name is used internally for saving, but the project directory
  intentionally avoids showing technical file names.
*/
function generateProjectName() {
  const names = [
    "space star",
    "little pony",
    "tulip bot",
    "voice bloom",
    "memory pod",
    "journal buddy"
  ];

  const randomName = names[Math.floor(Math.random() * names.length)];
  const randomNumber = Math.floor(Math.random() * 900 + 100);

  return `${randomName} ${randomNumber}`;
}

/* 
  Creates a new empty prototype project.
  The structure is prepared for later storage of shapes, components,
  voice journals, screenshots, and evaluation logs.
*/
function createNewProject() {
  const projects = loadProjects();

  const newProject = {
    id: crypto.randomUUID(),
    name: generateProjectName(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    previewImage: "",
    shapes: [],
    components: [],
    journals: [],
    evaluationLog: []
  };

  projects.push(newProject);
  saveProjects(projects);

  localStorage.setItem(ACTIVE_PROJECT_KEY, newProject.id);

  return newProject;
}

/* 
  Sets the active project before opening the workspace.
*/
function setActiveProject(projectId) {
  localStorage.setItem(ACTIVE_PROJECT_KEY, projectId);
}

/* 
  Returns the active project identifier.
*/
function getActiveProjectId() {
  return localStorage.getItem(ACTIVE_PROJECT_KEY);
}

/* 
  Returns the full active project object.
*/
function getActiveProject() {
  const projects = loadProjects();
  const activeProjectId = getActiveProjectId();

  return projects.find((project) => project.id === activeProjectId) || null;
}

/* 
  Deletes a project by ID.
  If the deleted project is currently active, the active project reference
  is removed to prevent the workspace opening deleted data.
*/
function deleteProject(projectId) {
  const projects = loadProjects();
  const filteredProjects = projects.filter((project) => project.id !== projectId);

  saveProjects(filteredProjects);

  if (getActiveProjectId() === projectId) {
    localStorage.removeItem(ACTIVE_PROJECT_KEY);
  }
}