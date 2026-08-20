let microProgramsData = [];

function cleanProgramName(rawName) {
  if (!rawName) return '未命名規劃書';

  const normalized = rawName
    .replace(/\s+/g, ' ')
    .replace(/（[^）]*）/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .trim();

  const match = normalized.match(/(.+規劃書)/);
  return match ? match[1].trim() : normalized;
}

const state = {
  selectedDomain: 'all',
  selectedYear: 'all'
};

const domainFilter = document.getElementById('domainFilter');
const yearFilter = document.getElementById('yearFilter');
const summaryCards = document.getElementById('summaryCards');
const summaryOverview = document.getElementById('summaryOverview');
const programList = document.getElementById('programList');

function normalize(text) {
  return text.replace(/\s+/g, '').toLowerCase();
}

function courseName(course) {
  if (typeof course === 'string') return course;
  return [course.prefix, course.name].filter(Boolean).join(' ');
}

function displayCourseName(course) {
  const name = courseName(course);
  const digitalCourse = name.match(/^數位自學\s*(.*)$/);
  return digitalCourse
    ? `<strong>數位自學 - ${digitalCourse[1]}</strong>`
    : name;
}

function extractCourseCredits(course) {
  if (course && course.credit !== undefined && course.credit !== null) {
    const credit = Number(course.credit);
    return Number.isFinite(credit) ? credit : null;
  }

  const raw = courseName(course);
  const match = raw.match(/\((\d+(?:\.\d+)?)學分\)|\[(\d+(?:\.\d+)?)學分\]|\b(\d+(?:\.\d+)?)學分\b/);
  if (!match) return null;
  const credit = Number(match[1] || match[2] || match[3]);
  return Number.isFinite(credit) ? credit : null;
}

function formatCourseItem(course) {
  const displayName = displayCourseName(course);
  const credit = extractCourseCredits(course);
  return credit === null ? displayName : `${displayName} <span class="course-credit">(${credit})</span>`;
}

function courseDisplayName(course) {
  if (!course) return '未命名課程';
  if (typeof course === 'string') return course;
  if (typeof course === 'object') {
    return course.name || course.courseName || course.title || '未命名課程';
  }
  return String(course);
}

function getUniqueDomains() {
  return [...new Set(microProgramsData.map((program) => program.domain))];
}

function getUniqueYears() {
  return [...new Set(microProgramsData.map((program) => program.year))].sort((a, b) => a - b);
}

function populateFilters() {
  const domainOptions = ['all', ...getUniqueDomains()];
  domainFilter.innerHTML = domainOptions
    .map((domain) => `<option value="${domain}">${domain === 'all' ? '全部' : domain}</option>`)
    .join('');

  const yearOptions = ['all', ...getUniqueYears()];
  yearFilter.innerHTML = yearOptions
    .map((year) => `<option value="${year}">${year === 'all' ? '全部' : `${year}學年度`}</option>`)
    .join('');
}

function getFilteredPrograms() {
  return microProgramsData.filter((program) => {
    const domainMatch = state.selectedDomain === 'all' || program.domain === state.selectedDomain;
    const yearMatch = state.selectedYear === 'all' || program.year === Number(state.selectedYear);
    return domainMatch && yearMatch;
  });
}

function renderSummary() {
  const filtered = getFilteredPrograms();
  const totalPrograms = filtered.length;
  const totalCourses = filtered.reduce((sum, program) => sum + program.courses.length, 0);
  const domains = [...new Set(filtered.map((program) => program.domain))];
  const years = [...new Set(filtered.map((program) => program.year))].sort((a, b) => a - b);

  summaryCards.innerHTML = `
    <div class="summary-card">
      <span>符合條件的規劃書</span>
      <strong>${totalPrograms}</strong>
    </div>
    <div class="summary-card">
      <span>包含課程數</span>
      <strong>${totalCourses}</strong>
    </div>
    <div class="summary-card">
      <span>領域數</span>
      <strong>${domains.length}</strong>
    </div>
    <div class="summary-card">
      <span>學年度數</span>
      <strong>${years.length}</strong>
    </div>
  `;
}

function renderOverviewTable() {
  const grouped = getFilteredPrograms().reduce((acc, program) => {
    const key = `${program.domain}::${program.year}`;
    if (!acc[key]) {
      acc[key] = {
        domain: program.domain,
        year: program.year,
        programs: [],
        courseCount: 0
      };
    }

    acc[key].programs.push(program);
    acc[key].courseCount += program.courses.length;
    return acc;
  }, {});

  const rows = Object.values(grouped).sort((a, b) => {
    if (a.domain === b.domain) return a.year - b.year;
    return a.domain.localeCompare(b.domain, 'zh-Hant');
  });

  summaryOverview.innerHTML = rows.length
    ? `
      <table class="overview-table">
        <thead>
          <tr>
            <th>領域</th>
            <th>學年度</th>
            <th>規劃書數</th>
            <th>課程數</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${row.domain}</td>
              <td>${row.year}學年度</td>
              <td>${row.programs.length}</td>
              <td>${row.courseCount}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
    : '<p>目前沒有可顯示的統計資料。</p>';
}

function renderProgramList() {
  const filtered = getFilteredPrograms();

  programList.innerHTML = filtered.length
    ? filtered
        .map((program) => {
          const categoryOrder = ['基礎', '核心', '應用'];
          const categoryMap = categoryOrder.reduce((acc, category) => {
            acc[category] = (program.courses || []).filter((course) => course.category === category);
            return acc;
          }, {});

          const cards = categoryOrder.map((category) => {
            const categoryCourses = categoryMap[category] || [];
            const totalCredits = categoryCourses.reduce((sum, course) => {
              const match = String(course.name || '').match(/\((\d+)學分\)|\[(\d+)學分\]|\b(\d+)學分\b/);
              if (match) {
                const credit = Number(match[1] || match[2] || match[3]);
                return sum + (Number.isFinite(credit) ? credit : 0);
              }
              return sum;
            }, 0);

            const requirementText = totalCredits > 0 ? `${totalCredits} 學分` : '未明確標註（目前資料庫未含學分數）';
            const courseList = categoryCourses.length
              ? categoryCourses.map((course) => `<li>${formatCourseItem(course)}</li>`).join('')
              : '<li>此類別目前沒有可顯示課程。</li>';

            return `
              <div class="program-planning-card">
                <h4>${category}</h4>
                <div class="planning-meta">學分需求：${requirementText}</div>
                <ul>${courseList}</ul>
              </div>
            `;
          }).join('');

          const requirementInfo = program.requirements || {};
          const totalRequirementText = Number(requirementInfo.totalCredits) > 0
            ? `<div class="planning-meta">完成此微學程需修滿 ${requirementInfo.totalCredits} 學分</div>`
            : '<div class="planning-meta">完成此微學程總學分資訊目前尚未明確標註。</div>';

          return `
            <div class="program-item">
              <div class="program-planning-header">
                <h3>${program.programName}</h3>
                <div class="meta">${program.domain} • ${program.year}學年度 • ${program.semester} • ${program.type}</div>
                ${totalRequirementText}
              </div>
              <div class="tag-row">
                <span class="tag">${program.semester}</span>
                <span class="tag success">${program.year}學年度</span>
                <span class="tag warn">${program.type}</span>
              </div>
              <div class="program-planning-grid">${cards}</div>
            </div>
          `;
        })
        .join('')
    : '<p>目前沒有符合條件的資料。</p>';
}

function renderStatisticsPage() {
  const data = window.microProgramsDataSeed || [];
  microProgramsData = data.map((item, index) => ({
    id: `${item.domain}-${index}`,
    domain: item.domain,
    domainKey: item.domain.replace(/領域/g, '').trim(),
    programName: cleanProgramName(item.programName),
    year: item.year,
    semester: item.semester,
    type: item.type,
    courses: Array.isArray(item.courses) ? item.courses : [],
    requirements: item.requirements || {
      totalCredits: null,
      minCoursesPerCategory: { 基礎: 1, 核心: 1, 應用: 1 },
      perCategoryCredits: { 基礎: null, 核心: null, 應用: null }
    }
  }));

  populateFilters();
  renderSummary();
  renderOverviewTable();
  renderProgramList();
}

domainFilter.addEventListener('change', (event) => {
  state.selectedDomain = event.target.value;
  renderSummary();
  renderOverviewTable();
  renderProgramList();
});

yearFilter.addEventListener('change', (event) => {
  state.selectedYear = event.target.value;
  renderSummary();
  renderOverviewTable();
  renderProgramList();
});

renderStatisticsPage();
