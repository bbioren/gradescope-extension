# Your Gradescope Grades

A Chrome extension that calculates and displays your average grade across assignments on Gradescope.

![Chrome Web Store](https://img.shields.io/badge/platform-Chrome-blue)

## Features

### Grade Averages
- **Weighted average** (by total points) displayed on every course page
- **Equal weight average** (each assignment counts the same)
- **Custom weighted average** with user-defined groups and percentages
- Letter grade and color-coded display (A+ through F)

### Filtering
- **Drop lowest X grades** globally
- **Exclude by type** - toggle off Midterms, Finals, Exams, Quizzes, Labs, or Projects
- **Custom keyword exclusion** - add any keyword to filter out matching assignments

### Custom Weight Groups
- Create named groups (e.g. "Homework", "Exams") and assign a weight percentage
- **Pick specific assignments** into each group from a dropdown
- **Group assignments together** - combine multiple Gradescope entries that count as one grade (e.g. HW1a + HW1b = one homework grade)
- **Drop lowest per group** - each group has its own drop lowest setting
- Unassigned assignments automatically get the remaining weight

### Breakdown View
- Expand to see all assignments with scores and percentages
- When custom weights are active, shows **grouped view** with combined group scores
- Dropped assignments shown faded with a "dropped" tag
- Individual assignments indented under their group

### Popup Summary
- Click the extension icon to see averages across all your courses
- Click a course to navigate directly to it

## Install

### From source
1. Clone this repo
   ```
   git clone https://github.com/bbioren/gradescope-extension.git
   ```
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked**
5. Select the cloned folder
6. Navigate to any Gradescope course page

## How It Works

The extension runs a content script on `gradescope.com/courses/*` pages. It scrapes assignment names and scores from the page, computes averages, and injects a banner above the course content. All settings and grade data are stored locally in your browser via `chrome.storage` - nothing is sent anywhere.

## Privacy

- All data stays in your browser
- No external servers or analytics
- No data collection or transmission
- Open source

## Not affiliated with Gradescope or Turnitin.
