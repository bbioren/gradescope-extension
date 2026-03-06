(function () {
  "use strict";

  const BANNER_ID = "gs-avg-banner";

  function safeRun(fn) {
    return function (...args) {
      try {
        return fn.apply(this, args);
      } catch (e) {
        if (e.message && e.message.includes("Extension context invalidated")) {
          destroyed = true;
          try { observer.disconnect(); } catch (_) {}
          return;
        }
        throw e;
      }
    };
  }
  let allAssignments = [];
  let settings = { dropLowest: 0, excludePatterns: [], equalWeight: false, customWeights: false, weightGroups: [] };
  let destroyed = false;
  let settingsPanelOpen = false;
  let breakdownOpen = false;

  function killIfInvalid() {
    if (destroyed) return true;
    try {
      void chrome.runtime.id;
      return false;
    } catch (e) {
      destroy();
      return true;
    }
  }

  function destroy() {
    destroyed = true;
    try { observer.disconnect(); } catch (e) {}
  }

  const DEFAULT_EXCLUDE_PATTERNS = [
    { label: "Midterms", pattern: "midterm", enabled: false },
    { label: "Finals", pattern: "final", enabled: false },
    { label: "Exams", pattern: "exam", enabled: false },
    { label: "Quizzes", pattern: "quiz", enabled: false },
    { label: "Labs", pattern: "lab", enabled: false },
    { label: "Projects", pattern: "project", enabled: false },
  ];

  function loadSettings(callback) {
    if (killIfInvalid()) return;
    try {
      const courseId = getCourseId();
      const key = `settings_${courseId}`;
      chrome.storage.local.get([key], (result) => {
        if (killIfInvalid()) return;
        if (result && result[key]) {
          settings = result[key];
        }
        callback();
      });
    } catch (e) {
      destroy();
    }
  }

  function saveSettings() {
    if (killIfInvalid()) return;
    try {
      const courseId = getCourseId();
      if (!courseId) return;
      const key = `settings_${courseId}`;
      chrome.storage.local.set({ [key]: settings });
    } catch (e) {
      destroy();
    }
  }

  function getCourseId() {
    const match = window.location.pathname.match(/\/courses\/(\d+)/);
    return match ? match[1] : null;
  }

  function parseScore(text) {
    if (!text) return null;
    const parts = text.split("/").map((s) => s.trim());
    if (parts.length !== 2) return null;
    const earned = parseFloat(parts[0]);
    const total = parseFloat(parts[1]);
    if (isNaN(earned) || isNaN(total) || total === 0) return null;
    return { earned, total };
  }

  function scrapeGrades() {
    const assignments = [];
    const rows = document.querySelectorAll(
      "table.table-assignments tbody tr, table tbody tr"
    );

    rows.forEach((row) => {
      const nameEl = row.querySelector("th a, td a, a.table--primaryLink");
      const scoreEl = row.querySelector(
        "div.submissionStatus--score, .submissionStatus--score, td.submissionStatus div"
      );

      if (!nameEl || !scoreEl) return;

      const name = nameEl.textContent.trim();
      const scoreText = scoreEl.textContent.trim();
      const score = parseScore(scoreText);

      if (score) {
        assignments.push({
          name,
          earned: score.earned,
          total: score.total,
          pct: (score.earned / score.total) * 100,
        });
      }
    });

    return assignments;
  }

  function applyFilters(assignments) {
    let filtered = [...assignments];

    const activePatterns = (settings.excludePatterns || [])
      .filter((p) => p.enabled)
      .map((p) => p.pattern.toLowerCase());

    if (activePatterns.length > 0) {
      filtered = filtered.filter((a) => {
        const name = a.name.toLowerCase();
        return !activePatterns.some((p) => name.includes(p));
      });
    }

    const dropCount = settings.dropLowest || 0;
    if (dropCount > 0 && dropCount < filtered.length) {
      filtered.sort((a, b) => a.pct - b.pct);
      filtered = filtered.slice(dropCount);
    }

    return filtered;
  }

  function computeStats(assignments) {
    if (assignments.length === 0)
      return { count: 0, weightedAvg: 0, simpleAvg: 0, customAvg: null, totalEarned: 0, totalPossible: 0 };

    const totalEarned = assignments.reduce((s, a) => s + a.earned, 0);
    const totalPossible = assignments.reduce((s, a) => s + a.total, 0);
    const weightedAvg = (totalEarned / totalPossible) * 100;
    const simpleAvg =
      assignments.reduce((s, a) => s + a.pct, 0) / assignments.length;

    let customAvg = null;
    if (settings.customWeights && settings.weightGroups && settings.weightGroups.length > 0) {
      customAvg = computeCustomWeightedAvg(assignments);
    }

    return {
      count: assignments.length,
      weightedAvg,
      simpleAvg,
      customAvg,
      totalEarned,
      totalPossible,
    };
  }

  function computeCustomWeightedAvg(assignments) {
    const groups = settings.weightGroups || [];
    if (groups.length === 0) return null;

    let totalWeight = 0;
    let weightedSum = 0;
    const matched = new Set();

    for (const group of groups) {
      const weight = parseFloat(group.weight) || 0;
      const members = group.assignments || [];
      if (members.length === 0 || weight === 0) continue;

      const groupAssignments = assignments.filter((a) => members.includes(a.name));
      if (groupAssignments.length === 0) continue;

      const groupEarned = groupAssignments.reduce((s, a) => s + a.earned, 0);
      const groupPossible = groupAssignments.reduce((s, a) => s + a.total, 0);
      const groupPct = (groupEarned / groupPossible) * 100;
      weightedSum += groupPct * (weight / 100);
      totalWeight += weight;
      groupAssignments.forEach((a) => matched.add(a.name));
    }

    const unmatched = assignments.filter((a) => !matched.has(a.name));
    if (unmatched.length > 0 && totalWeight < 100) {
      const remainingWeight = 100 - totalWeight;
      const unmatchedEarned = unmatched.reduce((s, a) => s + a.earned, 0);
      const unmatchedPossible = unmatched.reduce((s, a) => s + a.total, 0);
      const unmatchedPct = (unmatchedEarned / unmatchedPossible) * 100;
      weightedSum += unmatchedPct * (remainingWeight / 100);
      totalWeight += remainingWeight;
    }

    if (totalWeight === 0) return null;
    return (weightedSum / totalWeight) * 100;
  }

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

  function getExcludePatterns() {
    if (settings.excludePatterns && settings.excludePatterns.length > 0) {
      return settings.excludePatterns;
    }
    settings.excludePatterns = DEFAULT_EXCLUDE_PATTERNS.map((p) => ({ ...p }));
    return settings.excludePatterns;
  }

  function buildGroupsHTML(filtered) {
    const groups = settings.weightGroups || [];
    if (groups.length === 0) return "";

    return groups.map(function(group, i) {
      var assignedNames = {};
      (group.assignments || []).forEach(function(n) { assignedNames[n] = true; });
      var otherNames = {};
      groups.forEach(function(g, gi) {
        if (gi !== i) (g.assignments || []).forEach(function(n) { otherNames[n] = true; });
      });
      var available = filtered.filter(function(a) { return !assignedNames[a.name] && !otherNames[a.name]; });

      var membersHTML = (group.assignments || []).map(function(name) {
        return '<span class="gs-avg-weight-member" data-name="' + name.replace(/"/g, '&quot;') + '">'
          + name + ' <button class="gs-avg-weight-member-remove">&times;</button></span>';
      }).join("");

      var optionsHTML = available.map(function(a) {
        return '<option value="' + a.name.replace(/"/g, '&quot;') + '">' + a.name + ' (' + a.earned + '/' + a.total + ')</option>';
      }).join("");

      return '<div class="gs-avg-weight-group" data-group-index="' + i + '">'
        + '<div class="gs-avg-weight-group-header">'
        + '<input type="text" class="gs-avg-weight-group-name" value="' + (group.name || '').replace(/"/g, '&quot;') + '" placeholder="Group name (e.g. Homework)" />'
        + '<input type="number" class="gs-avg-weight-group-pct" value="' + (group.weight || 0) + '" min="0" max="100" placeholder="%" />'
        + '<span class="gs-avg-weight-cat-pct-sign">%</span>'
        + '<button class="gs-avg-weight-group-remove">&times;</button>'
        + '</div>'
        + '<div class="gs-avg-weight-group-members">' + membersHTML + '</div>'
        + '<select class="gs-avg-weight-group-select">'
        + '<option value="">+ Add assignment to group...</option>'
        + optionsHTML
        + '</select>'
        + '</div>';
    }).join("");
  }

  function renderBanner(stats, filtered) {
    let banner = document.getElementById(BANNER_ID);
    if (banner) banner.remove();

    if (allAssignments.length === 0) return;

    banner = document.createElement("div");
    banner.id = BANNER_ID;

    const displayAvg = settings.customWeights && stats.customAvg !== null
      ? stats.customAvg
      : settings.equalWeight ? stats.simpleAvg : stats.weightedAvg;
    const color = stats.count > 0 ? getGradeColor(displayAvg) : "#64748b";
    const letter = stats.count > 0 ? getLetterGrade(displayAvg) : "--";
    const pctText = stats.count > 0 ? displayAvg.toFixed(1) + "%" : "--";

    const excludePatterns = getExcludePatterns();
    const totalExcluded = allAssignments.length - filtered.length - (settings.dropLowest || 0);
    const droppedCount = Math.min(settings.dropLowest || 0, filtered.length + (settings.dropLowest || 0));
    const hasFilters = (settings.dropLowest > 0) || excludePatterns.some((p) => p.enabled);

    const filterSummaryParts = [];
    if (droppedCount > 0) filterSummaryParts.push(`${droppedCount} lowest dropped`);
    const activeExcludes = excludePatterns.filter((p) => p.enabled).map((p) => p.label);
    if (activeExcludes.length > 0) filterSummaryParts.push(`excl. ${activeExcludes.join(", ")}`);
    const filterSummary = filterSummaryParts.length > 0
      ? `<span class="gs-avg-filter-summary">(${filterSummaryParts.join("; ")})</span>`
      : "";

    banner.innerHTML = `
      <div class="gs-avg-card">
        <div class="gs-avg-main">
          <div class="gs-avg-circle" style="--grade-color: ${color}">
            <span class="gs-avg-pct">${pctText}</span>
            <span class="gs-avg-letter">${letter}</span>
          </div>
          <div class="gs-avg-details">
            <h3 class="gs-avg-title">Your Grade Average</h3>
            <div class="gs-avg-row">
              <span class="gs-avg-label">Weighted avg (by points):</span>
              <span class="gs-avg-value" ${!settings.equalWeight && !settings.customWeights ? 'style="color:' + color + '"' : ''}>${stats.count > 0 ? stats.weightedAvg.toFixed(2) + "%" : "--"}</span>
            </div>
            <div class="gs-avg-row">
              <span class="gs-avg-label">Equal weight avg:</span>
              <span class="gs-avg-value" ${settings.equalWeight && !settings.customWeights ? 'style="color:' + color + '"' : ''}>${stats.count > 0 ? stats.simpleAvg.toFixed(2) + "%" : "--"}</span>
            </div>
            ${settings.customWeights && stats.customAvg !== null ? `
            <div class="gs-avg-row">
              <span class="gs-avg-label">Custom weighted avg:</span>
              <span class="gs-avg-value" style="color:${color}">${stats.customAvg.toFixed(2)}%</span>
            </div>
            ` : ""}
            <div class="gs-avg-row">
              <span class="gs-avg-label">Total points:</span>
              <span class="gs-avg-value">${stats.totalEarned.toFixed(1)} / ${stats.totalPossible.toFixed(1)}</span>
            </div>
            <div class="gs-avg-row">
              <span class="gs-avg-label">Assignments included:</span>
              <span class="gs-avg-value">${stats.count} of ${allAssignments.length} ${filterSummary}</span>
            </div>
          </div>
        </div>
        <div class="gs-avg-actions">
          <button class="gs-avg-btn gs-avg-settings-btn" title="Filter settings">&#9881;</button>
          <button class="gs-avg-btn gs-avg-toggle" title="Assignment breakdown">&#9660;</button>
        </div>
      </div>
      <div class="gs-avg-settings-panel" style="display:none">
        <div class="gs-avg-settings-section">
          <label class="gs-avg-settings-label">Weighting</label>
          <div class="gs-avg-chips">
            <button class="gs-avg-chip ${settings.equalWeight ? "gs-avg-chip--active" : ""}" id="gs-avg-equal-btn">
              Weight assignments equally
            </button>
            <button class="gs-avg-chip ${settings.customWeights ? "gs-avg-chip--active" : ""}" id="gs-avg-custom-weights-btn">
              Custom weights
            </button>
          </div>
          <div class="gs-avg-weight-editor" style="display:${settings.customWeights ? 'block' : 'none'}">
            <div class="gs-avg-weight-groups">
              ${buildGroupsHTML(filtered)}
            </div>
            <button class="gs-avg-weight-add">+ Add group</button>
            <div class="gs-avg-weight-total">
              Total: ${(settings.weightGroups || []).reduce((s, g) => s + (parseFloat(g.weight) || 0), 0)}%
              ${(settings.weightGroups || []).reduce((s, g) => s + (parseFloat(g.weight) || 0), 0) !== 100 ? '<span class="gs-avg-weight-warn">(should be 100%)</span>' : '<span class="gs-avg-weight-ok">\u2713</span>'}
            </div>
            <div class="gs-avg-weight-hint">Unassigned assignments get the remaining weight.</div>
          </div>
        </div>
        <div class="gs-avg-settings-section">
          <label class="gs-avg-settings-label">Drop lowest grades</label>
          <div class="gs-avg-drop-row">
            <button class="gs-avg-drop-btn" data-delta="-1">-</button>
            <span class="gs-avg-drop-value">${settings.dropLowest || 0}</span>
            <button class="gs-avg-drop-btn" data-delta="1">+</button>
          </div>
        </div>
        <div class="gs-avg-settings-section">
          <label class="gs-avg-settings-label">Exclude by type</label>
          <div class="gs-avg-chips">
            ${excludePatterns
              .map(
                (p, i) => `
              <button class="gs-avg-chip ${p.enabled ? "gs-avg-chip--active" : ""}" data-index="${i}">
                ${p.label}
              </button>`
              )
              .join("")}
          </div>
        </div>
        <div class="gs-avg-settings-section">
          <label class="gs-avg-settings-label">Custom keyword exclude</label>
          <div class="gs-avg-custom-row">
            <input type="text" class="gs-avg-custom-input" placeholder="e.g. homework, extra credit" />
            <button class="gs-avg-custom-add">Add</button>
          </div>
          <div class="gs-avg-custom-chips">
            ${(settings.excludePatterns || [])
              .filter((p) => !DEFAULT_EXCLUDE_PATTERNS.some((d) => d.pattern === p.pattern))
              .map(
                (p, i) => `
              <button class="gs-avg-chip gs-avg-chip--custom ${p.enabled ? "gs-avg-chip--active" : ""}" data-pattern="${p.pattern}">
                ${p.label} &times;
              </button>`
              )
              .join("")}
          </div>
        </div>
      </div>
      <div class="gs-avg-breakdown" style="display:none"></div>
    `;

    const anchor =
      document.querySelector("div.courseHeader--courseDescription") ||
      document.querySelector("div.courseHeader--courseID") ||
      document.querySelector("div.courseHeader") ||
      document.querySelector(".courseHeader") ||
      document.querySelector("h1");

    if (anchor) {
      anchor.insertAdjacentElement("afterend", banner);
    } else {
      const main =
        document.querySelector("main") ||
        document.querySelector(".courseContentContainer") ||
        document.body;
      main.prepend(banner);
    }

    const toggle = banner.querySelector(".gs-avg-toggle");
    const breakdown = banner.querySelector(".gs-avg-breakdown");
    const settingsBtn = banner.querySelector(".gs-avg-settings-btn");
    const settingsPanel = banner.querySelector(".gs-avg-settings-panel");

    if (settingsPanelOpen) {
      settingsPanel.style.display = "block";
      settingsBtn.classList.add("gs-avg-btn--active");
    }
    if (breakdownOpen) {
      breakdown.style.display = "block";
      toggle.innerHTML = "&#9650;";
      renderBreakdown(breakdown, filtered);
    }

    toggle.addEventListener("click", () => {
      breakdownOpen = breakdown.style.display === "none";
      breakdown.style.display = breakdownOpen ? "block" : "none";
      toggle.innerHTML = breakdownOpen ? "&#9650;" : "&#9660;";
      if (breakdownOpen) renderBreakdown(breakdown, filtered);
    });

    settingsBtn.addEventListener("click", () => {
      settingsPanelOpen = settingsPanel.style.display === "none";
      settingsPanel.style.display = settingsPanelOpen ? "block" : "none";
      settingsBtn.classList.toggle("gs-avg-btn--active", settingsPanelOpen);
    });

    banner.querySelector("#gs-avg-equal-btn").addEventListener("click", () => {
      settings.equalWeight = !settings.equalWeight;
      if (settings.equalWeight) settings.customWeights = false;
      saveSettings();
      recalculate();
    });

    banner.querySelector("#gs-avg-custom-weights-btn").addEventListener("click", () => {
      settings.customWeights = !settings.customWeights;
      if (settings.customWeights) settings.equalWeight = false;
      saveSettings();
      recalculate();
    });

    const weightEditor = banner.querySelector(".gs-avg-weight-editor");
    if (weightEditor) {
      banner.querySelector(".gs-avg-weight-add").addEventListener("click", () => {
        if (!settings.weightGroups) settings.weightGroups = [];
        settings.weightGroups.push({ name: "", weight: 0, assignments: [] });
        saveSettings();
        recalculate();
      });

      weightEditor.querySelectorAll(".gs-avg-weight-group").forEach((groupEl) => {
        const idx = parseInt(groupEl.dataset.groupIndex);

        groupEl.querySelector(".gs-avg-weight-group-name").addEventListener("change", (e) => {
          settings.weightGroups[idx].name = e.target.value.trim();
          saveSettings();
        });

        groupEl.querySelector(".gs-avg-weight-group-pct").addEventListener("change", (e) => {
          settings.weightGroups[idx].weight = parseFloat(e.target.value) || 0;
          saveSettings();
          recalculate();
        });

        groupEl.querySelector(".gs-avg-weight-group-remove").addEventListener("click", () => {
          settings.weightGroups.splice(idx, 1);
          saveSettings();
          recalculate();
        });

        groupEl.querySelector(".gs-avg-weight-group-select").addEventListener("change", (e) => {
          const name = e.target.value;
          if (!name) return;
          if (!settings.weightGroups[idx].assignments) settings.weightGroups[idx].assignments = [];
          if (!settings.weightGroups[idx].assignments.includes(name)) {
            settings.weightGroups[idx].assignments.push(name);
          }
          saveSettings();
          recalculate();
        });

        groupEl.querySelectorAll(".gs-avg-weight-member-remove").forEach((removeBtn) => {
          removeBtn.addEventListener("click", (e) => {
            const memberEl = e.target.closest(".gs-avg-weight-member");
            const name = memberEl.dataset.name;
            settings.weightGroups[idx].assignments = (settings.weightGroups[idx].assignments || []).filter((n) => n !== name);
            saveSettings();
            recalculate();
          });
        });
      });
    }

    banner.querySelectorAll(".gs-avg-drop-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const delta = parseInt(btn.dataset.delta);
        settings.dropLowest = Math.max(0, (settings.dropLowest || 0) + delta);
        saveSettings();
        recalculate();
      });
    });

    banner.querySelectorAll(".gs-avg-chip:not(.gs-avg-chip--custom)").forEach((chip) => {
      chip.addEventListener("click", () => {
        const idx = parseInt(chip.dataset.index);
        const patterns = getExcludePatterns();
        patterns[idx].enabled = !patterns[idx].enabled;
        settings.excludePatterns = patterns;
        saveSettings();
        recalculate();
      });
    });

    banner.querySelectorAll(".gs-avg-chip--custom").forEach((chip) => {
      chip.addEventListener("click", () => {
        const pattern = chip.dataset.pattern;
        settings.excludePatterns = settings.excludePatterns.filter(
          (p) => p.pattern !== pattern
        );
        saveSettings();
        recalculate();
      });
    });

    const customInput = banner.querySelector(".gs-avg-custom-input");
    const customAddBtn = banner.querySelector(".gs-avg-custom-add");
    function addCustomKeyword() {
      const val = customInput.value.trim().toLowerCase();
      if (!val) return;
      const keywords = val.split(",").map((s) => s.trim()).filter(Boolean);
      keywords.forEach((kw) => {
        const exists = settings.excludePatterns.some((p) => p.pattern === kw);
        if (!exists) {
          settings.excludePatterns.push({
            label: kw.charAt(0).toUpperCase() + kw.slice(1),
            pattern: kw,
            enabled: true,
          });
        }
      });
      customInput.value = "";
      saveSettings();
      recalculate();
    }
    customAddBtn.addEventListener("click", addCustomKeyword);
    customInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addCustomKeyword();
    });

    saveToStorage(stats);
  }

  function renderBreakdown(container, filtered) {
    if (allAssignments.length === 0) {
      container.innerHTML = '<p class="gs-avg-empty">No graded assignments found.</p>';
      return;
    }

    if (settings.customWeights && (settings.weightGroups || []).length > 0) {
      renderGroupedBreakdown(container, filtered);
      return;
    }

    const filteredNames = new Set(filtered.map((a) => a.name));
    const sorted = [...allAssignments].sort((a, b) => b.pct - a.pct);

    let html = '<table class="gs-avg-table">';
    html += "<tr><th>Assignment</th><th>Score</th><th>%</th><th>Status</th></tr>";
    sorted.forEach((a) => {
      const included = filteredNames.has(a.name);
      const c = getGradeColor(a.pct);
      const rowClass = included ? "" : 'class="gs-avg-row--excluded"';
      const status = included ? "included" : "excluded";
      html += `<tr ${rowClass}>
        <td>${a.name}</td>
        <td>${a.earned} / ${a.total}</td>
        <td style="color:${included ? c : "#64748b"};font-weight:600">${a.pct.toFixed(1)}%</td>
        <td><span class="gs-avg-status gs-avg-status--${status}">${status}</span></td>
      </tr>`;
    });
    html += "</table>";
    container.innerHTML = html;
  }

  function renderGroupedBreakdown(container, filtered) {
    const groups = settings.weightGroups || [];
    const allGroupedNames = new Set();
    groups.forEach((g) => (g.assignments || []).forEach((n) => allGroupedNames.add(n)));

    let html = '<table class="gs-avg-table">';
    html += "<tr><th>Group</th><th>Score</th><th>%</th><th>Weight</th></tr>";

    groups.forEach((group) => {
      const members = (group.assignments || []).filter((name) =>
        filtered.some((a) => a.name === name)
      );
      const memberAssignments = filtered.filter((a) => members.includes(a.name));

      const groupEarned = memberAssignments.reduce((s, a) => s + a.earned, 0);
      const groupPossible = memberAssignments.reduce((s, a) => s + a.total, 0);
      const groupPct = groupPossible > 0 ? (groupEarned / groupPossible) * 100 : 0;
      const c = groupPossible > 0 ? getGradeColor(groupPct) : "#64748b";
      const groupName = group.name || "Unnamed group";

      html += `<tr class="gs-avg-group-row">
        <td><strong>${groupName}</strong> <span class="gs-avg-group-count">(${memberAssignments.length} assignment${memberAssignments.length !== 1 ? "s" : ""})</span></td>
        <td>${groupEarned.toFixed(1)} / ${groupPossible.toFixed(1)}</td>
        <td style="color:${c};font-weight:700">${groupPossible > 0 ? groupPct.toFixed(1) + "%" : "--"}</td>
        <td>${group.weight || 0}%</td>
      </tr>`;

      memberAssignments.sort((a, b) => b.pct - a.pct);
      memberAssignments.forEach((a) => {
        html += `<tr class="gs-avg-member-row">
          <td class="gs-avg-member-indent">${a.name}</td>
          <td class="gs-avg-member-cell">${a.earned} / ${a.total}</td>
          <td class="gs-avg-member-cell">${a.pct.toFixed(1)}%</td>
          <td></td>
        </tr>`;
      });
    });

    const ungrouped = filtered.filter((a) => !allGroupedNames.has(a.name));
    if (ungrouped.length > 0) {
      const totalWeight = groups.reduce((s, g) => s + (parseFloat(g.weight) || 0), 0);
      const remainingWeight = Math.max(0, 100 - totalWeight);
      const ugEarned = ungrouped.reduce((s, a) => s + a.earned, 0);
      const ugPossible = ungrouped.reduce((s, a) => s + a.total, 0);
      const ugPct = ugPossible > 0 ? (ugEarned / ugPossible) * 100 : 0;
      const ugColor = ugPossible > 0 ? getGradeColor(ugPct) : "#64748b";

      html += `<tr class="gs-avg-group-row">
        <td><strong>Ungrouped</strong> <span class="gs-avg-group-count">(${ungrouped.length} assignment${ungrouped.length !== 1 ? "s" : ""})</span></td>
        <td>${ugEarned.toFixed(1)} / ${ugPossible.toFixed(1)}</td>
        <td style="color:${ugColor};font-weight:700">${ugPossible > 0 ? ugPct.toFixed(1) + "%" : "--"}</td>
        <td>${remainingWeight}%</td>
      </tr>`;

      ungrouped.sort((a, b) => b.pct - a.pct);
      ungrouped.forEach((a) => {
        html += `<tr class="gs-avg-member-row">
          <td class="gs-avg-member-indent">${a.name}</td>
          <td class="gs-avg-member-cell">${a.earned} / ${a.total}</td>
          <td class="gs-avg-member-cell">${a.pct.toFixed(1)}%</td>
          <td></td>
        </tr>`;
      });
    }

    html += "</table>";
    container.innerHTML = html;
  }

  function saveToStorage(stats) {
    if (killIfInvalid()) return;
    try {
      const courseId = getCourseId();
      if (!courseId) return;
      const courseName =
        document.querySelector(".courseHeader--title")?.textContent?.trim() ||
        document.querySelector("h1")?.textContent?.trim() ||
        "Unknown Course";

      const data = {};
      data[`course_${courseId}`] = {
        name: courseName,
        weightedAvg: stats.weightedAvg,
        simpleAvg: stats.simpleAvg,
        count: stats.count,
        totalEarned: stats.totalEarned,
        totalPossible: stats.totalPossible,
        totalAssignments: allAssignments.length,
        dropLowest: settings.dropLowest || 0,
        updatedAt: Date.now(),
      };
      chrome.storage.local.set(data);
    } catch (e) {
      destroy();
    }
  }

  const recalculate = safeRun(function () {
    if (destroyed) return;
    const filtered = applyFilters(allAssignments);
    const stats = computeStats(filtered);
    renderBanner(stats, filtered);
  });

  const init = safeRun(function () {
    if (destroyed) return;
    allAssignments = scrapeGrades();
    loadSettings(() => {
      recalculate();
    });
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  const observer = new MutationObserver(safeRun(() => {
    if (destroyed) return;
    clearTimeout(observer._debounce);
    observer._debounce = setTimeout(safeRun(() => {
      if (destroyed) return;
      if (!document.getElementById(BANNER_ID)) {
        init();
      }
    }), 1000);
  }));
  observer.observe(document.body, { childList: true, subtree: true });
})();
