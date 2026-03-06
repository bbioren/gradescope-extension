(function () {
  "use strict";

  function scrapeCourseSections() {
    const activeCourseIds = [];
    const inactiveCourseIds = [];

    const termSections = document.querySelectorAll(".courseList--coursesForTerm");

    if (termSections.length > 0) {
      termSections.forEach((section, index) => {
        const links = section.querySelectorAll("a[href*='/courses/']");
        links.forEach((link) => {
          const match = link.href.match(/\/courses\/(\d+)/);
          if (match) {
            if (index === 0) {
              activeCourseIds.push(match[1]);
            } else {
              inactiveCourseIds.push(match[1]);
            }
          }
        });
      });
    }

    if (activeCourseIds.length === 0 && inactiveCourseIds.length === 0) {
      const allCourseLinks = document.querySelectorAll(
        ".courseBox a[href*='/courses/'], a.courseBox[href*='/courses/']"
      );

      let foundSeparator = false;
      const seenIds = new Set();

      document.querySelectorAll(".courseList > *, .courseList--coursesForTerm, .courseBox, h1, h2, h3, .courseList--term, button").forEach((el) => {
        const text = el.textContent.trim().toLowerCase();
        if (
          text.includes("see older") ||
          text.includes("past courses") ||
          text.includes("archived") ||
          text.includes("inactive")
        ) {
          foundSeparator = true;
        }

        const links = el.matches && el.matches("a[href*='/courses/']")
          ? [el]
          : el.querySelectorAll ? [...el.querySelectorAll("a[href*='/courses/']")] : [];

        links.forEach((link) => {
          const match = link.href.match(/\/courses\/(\d+)/);
          if (match && !seenIds.has(match[1])) {
            seenIds.add(match[1]);
            if (foundSeparator) {
              inactiveCourseIds.push(match[1]);
            } else {
              activeCourseIds.push(match[1]);
            }
          }
        });
      });
    }

    return { activeCourseIds, inactiveCourseIds };
  }

  function syncCourses() {
    try {
      const { activeCourseIds, inactiveCourseIds } = scrapeCourseSections();
      if (activeCourseIds.length > 0 || inactiveCourseIds.length > 0) {
        chrome.storage.local.set({
          __active_courses: activeCourseIds,
          __inactive_courses: inactiveCourseIds,
          __courses_synced_at: Date.now(),
        });
      }
    } catch (e) {
      // ignore
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncCourses);
  } else {
    syncCourses();
  }

  const observer = new MutationObserver(() => {
    clearTimeout(observer._debounce);
    observer._debounce = setTimeout(syncCourses, 2000);
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
