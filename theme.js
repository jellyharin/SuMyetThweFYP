/*
  Theme customisation controller.

  This script manages the landing page colour themes. The selected
  theme is stored in localStorage so the interface can retain the
  user's visual preference after refresh or navigation.
*/

/* Selects the full theme widget that contains the palette and colour buttons. */
const themeWidget = document.querySelector(".theme-widget");

/* Selects the palette button used to reveal or hide the colour options. */
const paletteButton = document.getElementById("paletteButton");

/* Selects all available theme colour buttons. */
const themeButtons = document.querySelectorAll(".theme-dot");

/* Defines the localStorage key used for saving the active theme. */
const themeStorageKey = "talkStudioTheme";

/* Loads a previously selected theme, or defaults to the pink theme. */
const savedTheme = localStorage.getItem(themeStorageKey) || "theme-pink";

/* Applies the saved theme when the page loads. */
document.body.classList.remove("theme-pink", "theme-blue", "theme-green", "theme-yellow");
document.body.classList.add(savedTheme);

/* Updates the active visual state on the matching theme dot. */
themeButtons.forEach((button) => {
  button.classList.toggle("active", button.dataset.theme === savedTheme);
});

/* Toggles the visibility of the theme colour strip. */
paletteButton.addEventListener("click", () => {
  themeWidget.classList.toggle("open");
});

/* Applies the selected theme and saves the preference locally. */
themeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const selectedTheme = button.dataset.theme;

    document.body.classList.remove("theme-pink", "theme-blue", "theme-green", "theme-yellow");
    document.body.classList.add(selectedTheme);

    localStorage.setItem(themeStorageKey, selectedTheme);

    themeButtons.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");

    themeWidget.classList.remove("open");
  });
});