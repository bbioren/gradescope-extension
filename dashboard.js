(function () {
  "use strict";

  function scrapeCurrentTermCourseIds() {
    const termSections = document.querySelectorAll(".courseList--coursesForTerm");
    if (termSections.length === 0) return [];

    let latestTerm = null;
    const activeIds = [];

    termSections.forEach((section) => {
      if (section.closest(".courseList--inactiveCourses")) return;

      const termEl = section.previousElementSibling;
      const termName = termEl && termEl.classList.contains("courseList--term")
        ? termEl.textContent.trim()
        : "";

      if (latestTerm === null) {
        latestTerm = termName;
      }

      if (termName !== latestTerm) return;

      section.querySelectorAll("a[href*='/courses/']").forEach((link) => {
        const match = link.href.match(/\/courses\/(\d+)/);
        if (match) activeIds.push(match[1]);
      });
    });

    return activeIds;
  }

  function syncCourses() {
    try {
      const activeCourseIds = scrapeCurrentTermCourseIds();
      if (activeCourseIds.length > 0) {
        chrome.storage.local.set({
          __active_courses: activeCourseIds,
          __courses_synced_at: Date.now(),
        });
      }
    } catch (e) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(syncCourses, 1000));
  } else {
    setTimeout(syncCourses, 1000);
  }

  const observer = new MutationObserver(() => {
    clearTimeout(observer._debounce);
    observer._debounce = setTimeout(syncCourses, 2000);
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
