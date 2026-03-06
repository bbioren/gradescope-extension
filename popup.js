(function () {
  function getLetterGrade(pct) {
    if (pct >= 97) return "A+";
    if (pct >= 93) return "A";
    if (pct >= 90) return "A-";
    if (pct >= 87) return "B+";
    if (pct >= 83) return "B";
    if (pct >= 80) return "B-";
    if (pct >= 77) return "C+";
    if (pct >= 73) return "C";
    if (pct >= 70) return "C-";
    if (pct >= 67) return "D+";
    if (pct >= 63) return "D";
    if (pct >= 60) return "D-";
    return "F";
  }

  function getGradeColor(pct) {
    if (pct >= 90) return "#22c55e";
    if (pct >= 80) return "#84cc16";
    if (pct >= 70) return "#eab308";
    if (pct >= 60) return "#f97316";
    return "#ef4444";
  }

  function timeAgo(ts) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  const container = document.getElementById("courses");

  chrome.storage.local.get(null, (items) => {
    const activeCourses = items.__active_courses;
    const activeSet = activeCourses ? new Set(activeCourses) : null;

    const courses = Object.entries(items)
      .filter(([key]) => key.startsWith("course_"))
      .map(([key, val]) => ({ ...val, courseId: key.replace("course_", "") }))
      .filter((c) => activeSet === null || activeSet.has(c.courseId))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    if (courses.length === 0) {
      container.innerHTML =
        '<p class="empty">No courses yet.<br>Open a Gradescope course to get started.</p>';
      return;
    }

    courses.forEach((c) => {
      const avg = c.displayAvg != null ? c.displayAvg : c.weightedAvg;
      const color = getGradeColor(avg);
      const letter = getLetterGrade(avg);
      const div = document.createElement("div");
      div.className = "course";
      div.innerHTML = `
        <div class="course-name">${c.name}</div>
        <div class="course-stats">
          <div class="grade-big" style="color:${color}">${avg.toFixed(1)}% <span style="font-size:16px;opacity:0.7">${letter}</span></div>
          <div class="meta">
            <div><strong>${c.count}</strong> assignments</div>
            <div>${c.totalEarned.toFixed(1)} / ${c.totalPossible.toFixed(1)} pts</div>
            <div>Updated ${timeAgo(c.updatedAt)}</div>
          </div>
        </div>
      `;
      container.appendChild(div);
    });
  });
})();
