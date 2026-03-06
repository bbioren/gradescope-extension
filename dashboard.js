(function () {
  "use strict";

  function scrapeArchivedCourses() {
    const archivedIds = [];

    document.querySelectorAll(".courseList--coursesForTerm").forEach((section) => {
      const heading = section.querySelector("h1, h2, h3, h4, .courseList--term");
      if (!heading) return;

      const headingText = heading.textContent.trim().toLowerCase();
      const isArchived =
        headingText.includes("archived") ||
        headingText.includes("inactive") ||
        section.classList.contains("courseList--archivedCourses");

      if (!isArchived) return;

      section.querySelectorAll("a[href*='/courses/']").forEach((link) => {
        const match = link.href.match(/\/courses\/(\d+)/);
        if (match) archivedIds.push(match[1]);
      });
    });

    document.querySelectorAll(".courseList--archivedCourses a[href*='/courses/'], .courseBox--isArchived a[href*='/courses/']").forEach((link) => {
      const match = link.href.match(/\/courses\/(\d+)/);
      if (match && !archivedIds.includes(match[1])) {
        archivedIds.push(match[1]);
      }
    });

    document.querySelectorAll(".courseBox").forEach((box) => {
      const isInactive = box.closest(".courseList--inactiveCourses, .courseList--archivedCourses");
      if (!isInactive) return;
      const link = box.querySelector("a[href*='/courses/']");
      if (link) {
        const match = link.href.match(/\/courses\/(\d+)/);
        if (match && !archivedIds.includes(match[1])) {
          archivedIds.push(match[1]);
        }
      }
    });

    return archivedIds;
  }

  function syncArchived() {
    try {
      const archivedIds = scrapeArchivedCourses();
      chrome.storage.local.set({ __archived_courses: archivedIds });
    } catch (e) {
      // ignore
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncArchived);
  } else {
    syncArchived();
  }

  const observer = new MutationObserver(() => {
    clearTimeout(observer._debounce);
    observer._debounce = setTimeout(syncArchived, 2000);
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
