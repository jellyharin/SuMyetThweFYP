/*
  Project directory controller.

  This script manages the project library page. It renders the
  add-project card, saved project cards, project preview icons,
  generated project names, creation dates, opening behaviour, and
  project deletion behaviour.
*/

/* Selects the grid container where all project cards are displayed. */
const projectGrid = document.getElementById("projectGrid");


/* =========================================================
   1. PROJECT NAME GENERATION
   ---------------------------------------------------------
   A readable random project name is generated when older saved
   projects do not already contain a name.
   ========================================================= */

function generateProjectName() {
  const names = [
    "Journal Buddy",
    "Space Star",
    "Memory Pod",
    "Voice Pebble",
    "Talk Bot",
    "Little Echo",
    "Dream Recorder",
    "Echo Friend"
  ];

  const randomName = names[Math.floor(Math.random() * names.length)];
  const randomNumber = Math.floor(Math.random() * 900) + 100;

  return `${randomName} ${randomNumber}`;
}


/* =========================================================
   2. DATE FORMATTING
   ---------------------------------------------------------
   Project dates are converted into a readable UK date and time
   format for display on the project cards.
   ========================================================= */

function formatProjectDate(dateValue) {
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}


/* =========================================================
   3. PROJECT DATA REPAIR
   ---------------------------------------------------------
   Older saved projects may not have name, createdAt, or
   updatedAt values. This function adds missing values so all
   cards can display consistently.
   ========================================================= */

function normaliseProjects() {
  const projects = loadProjects();
  let changed = false;

  const normalisedProjects = projects.map((project) => {
    const repairedProject = { ...project };

    if (!repairedProject.name) {
      repairedProject.name = generateProjectName();
      changed = true;
    }

    if (!repairedProject.createdAt) {
      repairedProject.createdAt = repairedProject.updatedAt || new Date().toISOString();
      changed = true;
    }

    if (!repairedProject.updatedAt) {
      repairedProject.updatedAt = repairedProject.createdAt;
      changed = true;
    }

    return repairedProject;
  });

  if (changed) {
    saveProjects(normalisedProjects);
  }

  return normalisedProjects;
}


/* =========================================================
   4. ADD PROJECT CARD
   ---------------------------------------------------------
   The first card always allows the user to create a new
   prototype and immediately enter the workspace.
   ========================================================= */

function createAddProjectCard() {
  const card = document.createElement("button");
  card.className = "library-card add-library-card";
  card.setAttribute("aria-label", "Add new project");

  card.innerHTML = `
    <div class="library-add-icon">＋</div>
  `;

  card.addEventListener("click", () => {
    const newProject = createNewProject();

    /*
      Ensures newly created projects contain display information,
      even if the shared app-state function does not add it yet.
    */
    const projects = loadProjects();
    const projectIndex = projects.findIndex((project) => project.id === newProject.id);

    if (projectIndex !== -1) {
      projects[projectIndex].name = projects[projectIndex].name || generateProjectName();
      projects[projectIndex].createdAt = projects[projectIndex].createdAt || new Date().toISOString();
      projects[projectIndex].updatedAt = projects[projectIndex].updatedAt || projects[projectIndex].createdAt;

      saveProjects(projects);
      setActiveProject(projects[projectIndex].id);
    }

    window.location.href = "workspace.html";
  });

  return card;
}


/* =========================================================
   5. SAVED PROJECT CARD
   ---------------------------------------------------------
   Each saved project card displays a preview, project name,
   creation date, open behaviour, and delete control.
   ========================================================= */

function createSavedProjectCard(project) {
  const card = document.createElement("article");
  card.className = "library-card saved-library-card";

  card.innerHTML = `
    <button class="project-delete-button" aria-label="Delete project">
      🗑
    </button>

    <button class="project-open-area" aria-label="Open project">
      <div class="library-preview">
        ${
          project.previewImage
            ? `<img src="${project.previewImage}" alt="Project preview" />`
            : `<span>🎙️</span>`
        }
      </div>

      <div class="project-card-text">
        <h2>${project.name}</h2>
        <p>Created: ${formatProjectDate(project.createdAt)}</p>
      </div>
    </button>
  `;

  const openArea = card.querySelector(".project-open-area");
  const deleteButton = card.querySelector(".project-delete-button");

  openArea.addEventListener("click", () => {
    setActiveProject(project.id);
    window.location.href = "workspace.html";
  });

  deleteButton.addEventListener("click", (event) => {
    event.stopPropagation();

    const confirmDelete = confirm("Delete this prototype?");

    if (confirmDelete) {
      deleteProject(project.id);
      renderProjects();
    }
  });

  return card;
}


/* =========================================================
   6. PROJECT LIBRARY RENDERING
   ---------------------------------------------------------
   The grid is cleared and rebuilt every time the project list
   changes.
   ========================================================= */

function renderProjects() {
  const projects = normaliseProjects();

  projectGrid.innerHTML = "";
  projectGrid.appendChild(createAddProjectCard());

  projects.forEach((project) => {
    projectGrid.appendChild(createSavedProjectCard(project));
  });
}


/* Renders the project library when the page loads. */
renderProjects();