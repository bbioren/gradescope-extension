(function () {
  "use strict";

  function scrapeActiveCourseIds() {
    const allCourseLinks = document.querySelectorAll("a[href*='/courses/']");
    if (allCourseLinks.length === 0) return [];

    const courseIdsByPosition = [];
    const seen = new Set();

    allCourseLinks.forEach((link) => {
      const match = link.href.match(/\/courses\/(\d+)/);
      if (match && !seen.has(match[1])) {
        seen.add(match[1]);
        courseIdsByPosition.push({
          id: match[1],
          top: link.getBoundingClientRect().top,
        });
      }
    });

    if (courseIdsByPosition.length === 0) return [];

    courseIdsByPosition.sort((a, b) => a.top - b.top);

    const termBreaks = [];
    const headings = document.querySelectorAll(
      "h1, h2, h3, h4, [class*='Term'], [class*='term'], [class*='heading'], [class*='Heading']"
    );

    headings.forEach((h) => {
      const text = h.textContent.trim();
      if (/\b(spring|summer|fall|winter|autumn)\s+\d{4}\b/i.test(text) ||
          /\b\d{4}\s+(spring|summer|fall|winter|autumn)\b/i.test(text) ||
          /\b(Q[1-4]|quarter|semester|term)\b/i.test(text)) {
        termBreaks.push({
          text: text,
          top: h.getBoundingClientRect().top,
        });
      }
    });

    termBreaks.sort((a, b) => a.top - b.top);

    if (termBreaks.length >= 2) {
      const firstTermTop = termBreaks[0].top;
      const secondTermTop = termBreaks[1].top;

      const activeCourseIds = courseIdsByPosition
        .filter((c) => c.top >= firstTermTop && c.top < secondTermTop)
        .map((c) => c.id);

      if (activeCourseIds.length > 0) return activeCourseIds;
    }

    const separatorTexts = ["see older", "past courses", "archived", "inactive", "show more"];
    let separatorTop = Infinity;

    document.querySelectorAll("button, a, span, div, h1, h2, h3, h4, p").forEach((el) => {
      if (el.children.length > 3) return;
      const text = el.textContent.trim().toLowerCase();
      if (separatorTexts.some((s) => text.includes(s)) && text.length < 50) {
        const top = el.getBoundingClientRect().top;
        if (top > 0 && top < separatorTop) {
          separatorTop = top;
        }
      }
    });

    if (separatorTop < Infinity) {
      const activeCourseIds = courseIdsByPosition
        .filter((c) => c.top < separatorTop)
        .map((c) => c.id);
      if (activeCourseIds.length > 0) return activeCourseIds;
    }

    return courseIdsByPosition.map((c) => c.id);
  }

  function syncCourses() {
    try {
      const activeCourseIds = scrapeActiveCourseIds();
      console.log("[GS Extension] Found active courses:", activeCourseIds);
      console.log("[GS Extension] All course links on page:", document.querySelectorAll("a[href*='/courses/']").length);
      if (activeCourseIds.length > 0) {
        chrome.storage.local.set({
          __active_courses: activeCourseIds,
          __courses_synced_at: Date.now(),
        });
      }
    } catch (e) {
      console.error("[GS Extension] Error syncing courses:", e);
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
