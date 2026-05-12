/*
  Home page interaction controller.

  The home page currently uses a standard anchor link for navigation.
  This file is kept as a separate module so that later landing-page
  behaviours can be added without mixing them into theme logic.
*/

/* Selects the primary build button. */
const buildButton = document.getElementById("buildButton");

/* 
  Provides a simple validation point before navigation.
  This can later be extended to reset session data or initialise a new project.
*/
buildButton.addEventListener("click", () => {
  console.log("Talk' Studio build workflow started.");
});