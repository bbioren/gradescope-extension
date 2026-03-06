(function () {
  "use strict";

  function scrapeCurrentTermCourseIds() {
    const termSections = document.querySelectorAll(".courseList--coursesForTerm");
    if (termSections.length === 0) return [];

    const termCourses = {};
    const termOrder = [];

    termSections.forEach((section) => {
      const isInactive = section.closest(".courseList--inactiveCourses");
      if (isInactive) return;

      const termEl = section.previousElementSibling;
      let termName = "";
      if (termEl && termEl.classList.contains("courseList--term")) {
        termName = termEl.textContent.trim();
      }

      const ids = [];
      section.querySelectorAll("a[href*='/courses/']").forEach((link) => {
        const match = link.href.match(/\/courses\/(\d+)/);
        if (match) ids.push(match[1]);
      });

      if (ids.length > 0) {
        if (!termCourses[termName]) {
          termCourses[termName] = [];
          termOrder.push(termName);
        }
        termCourses[termName].push(...ids);
      }
    });

    const currentTerm = getCurrentTerm();


    if (currentTerm && termCourses[currentTerm]) {
      return termCourses[currentTerm];
    }

    if (termOrder.length > 0) {
      const sorted = termOrder.slice().sort((a, b) => {
        return termToDate(a) - termToDate(b);
      });

      const now = Date.now();
      let best = sorted[0];
      let bestDiff = Infinity;
      for (const t of sorted) {
        const diff = Math.abs(termToDate(t) - now);
        if (diff < bestDiff) {
          bestDiff = diff;
          best = t;
        }
      }

      return termCourses[best] || [];
    }

    return [];
  }

  function getCurrentTerm() {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();

    if (month >= 0 && month <= 2) return "Winter " + year;
    if (month >= 3 && month <= 5) return "Spring " + year;
    if (month >= 6 && month <= 7) return "Summer " + year;
    if (month >= 8 && month <= 11) return "Fall " + year;
    return null;
  }

  function termToDate(termName) {
    const match = termName.match(/(winter|spring|summer|fall|autumn)\s+(\d{4})/i);
    if (!match) return 0;
    const season = match[1].toLowerCase();
    const year = parseInt(match[2]);
    const monthMap = { winter: 1, spring: 4, summer: 7, fall: 9, autumn: 9 };
    return new Date(year, monthMap[season] || 0, 1).getTime();
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
    } catch (e) {

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
