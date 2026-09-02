(function () {
  try {
    var t = localStorage.getItem("dailie-theme-v1");
    if (t !== "light" && t !== "dark") t = "light";
    if (t === "dark") document.documentElement.classList.add("dark-theme");
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", t === "dark" ? "#0a0a0a" : "#fafaf8");
  } catch (e) {}
})();
