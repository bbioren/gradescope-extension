(function () {
  "use strict";

  function scrapeActiveCourseIds() {
    const activeIds = [];
    const seen = new Set();

    document.querySelectorAll("a[href*='/courses/']").forEach((link) => {
      const match = link.href.match(/\/courses\/(\d+)/);
      if (!match || seen.has(match[1])) return;
      seen.add(match[1]);

      const isInactive = link.closest(".courseList--inactiveCourses");
      if (!isInactive) {
        activeIds.push(match[1]);
      }
    });

    return activeIds;
  }

  function syncCourses() {
    try {
      const activeCourseIds = scrapeActiveCourseIds();
      console.log("[GS Extension] Active courses:", activeCourseIds);
      if (activeCourseIds.length > 0) {
        chrome.storage.local.set({
          __active_courses: activeCourseIds,
          __courses_synced_at: Date.now(),
        });
      }
    } catch (e) {
      console.error("[GS Extension] Error:", e);
    }
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
