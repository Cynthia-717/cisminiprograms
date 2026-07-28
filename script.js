let microProgramsData = [];

function normalizeCourses(courses) {
  if (!Array.isArray(courses)) return [];

  return courses
    .map((course) => {
      if (typeof course === 'string') return { category: '未分類', name: course };
      if (!course || typeof course !== 'object') return null;
      const name = course.name || course.courseName || course.title;
      return name ? { category: course.category || course.type || '未分類', name } : null;
    })
    .filter(Boolean);
}

function courseName(course) {
  if (typeof course === 'string') return course;
  return [course.prefix, course.name].filter(Boolean).join(' ');
}

function displayCourseName(course) {
  const name = courseName(course);
  return name.startsWith('數位自學 ')
    ? `<strong>數位自學</strong> - ${name.slice('數位自學 '.length)}`
    : name;
}

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

async function loadData() {
  try {
    let data = [];

    if (window.microProgramsDataSeed && Array.isArray(window.microProgramsDataSeed)) {
      data = window.microProgramsDataSeed;
    } else {
      const response = await fetch('./data.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      data = await response.json();
    }

    microProgramsData = data.map((item, index) => ({
      id: `${item.domain}-${index}`,
      domain: item.domain,
      domainKey: item.domain.replace(/領域/g, '').trim(),
      programName: cleanProgramName(item.programName),
      year: item.year,
      semester: item.semester,
      type: item.type,
      courses: normalizeCourses(item.courses)
    }));

    populateFilters();
    renderSummary();
    renderAggregateView();
    renderSingleSearch();
    renderBatchAnalysis();
  } catch (error) {
    console.error('Failed to load data', error);
    microProgramsData = [];
  }
}

const state = {
  selectedDomain: "all",
  selectedYear: "all"
};

const courseInput = document.getElementById("courseInput");
const searchBtn = document.getElementById("searchBtn");
const singleResult = document.getElementById("singleResult");
const batchInput = document.getElementById("batchInput");
const batchBtn = document.getElementById("batchBtn");
const batchResult = document.getElementById("batchResult");
const domainFilter = document.getElementById("domainFilter");
const yearFilter = document.getElementById("yearFilter");
const summaryCards = document.getElementById("summaryCards");
const summaryOverview = document.getElementById("summaryOverview");
const programList = document.getElementById("programList");
const aggregateDomain = document.getElementById("aggregateDomain");
const aggregateResult = document.getElementById("aggregateResult");
const fullList = document.getElementById("fullList");

function normalize(text) {
  return text.replace(/\s+/g, "").toLowerCase();
}

function getMatchesForCourse(query) {
  const normalizedQuery = normalize(query);
  return microProgramsData.filter((program) =>
    program.courses.some((course) => normalize(courseName(course)).includes(normalizedQuery))
  );
}

function renderSingleSearch() {
  const query = courseInput.value.trim();
  if (!query) {
    singleResult.innerHTML = '<p>請輸入課程名稱。</p>';
    return;
  }

  const matches = getMatchesForCourse(query);
  if (!matches.length) {
    singleResult.innerHTML = '<p>查無相關課程。</p>';
    return;
  }

  const items = matches
    .map((program) => {
      const matchedCourses = program.courses.filter((course) => normalize(courseName(course)).includes(normalize(query)));
      return `
        <div class="program-item">
          <h3>${program.programName}</h3>
          <div class="meta">${program.domain} • ${program.year}學年度 • ${program.semester} • ${program.type}</div>
          <div class="tag-row">
            <span class="tag">${program.semester}</span>
            <span class="tag success">${program.year}學年度</span>
          </div>
          <ul>
            ${matchedCourses.map((course) => `<li>${course.category}：${displayCourseName(course)}</li>`).join("")}
          </ul>
        </div>`;
    })
    .join("");

  singleResult.innerHTML = items;
}

function parseCourseInput(rawText) {
  return rawText
    .split(/[\n,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function renderBatchAnalysis() {
  const parseList = parseCourseInput(batchInput.value);
  if (!parseList.length) {
    batchResult.innerHTML = '<p>請輸入至少一門課程。</p>';
    return;
  }

  const allMatches = parseList.map((course) => ({ course, matches: getMatchesForCourse(course) }));
  const commonPrograms = microProgramsData.filter((program) => {
    return parseList.every((course) =>
      program.courses.some((item) => normalize(courseName(item)).includes(normalize(course)))
    );
  });

  const summary = `
    <div class="tag-row">
      <span class="tag">查詢課程數：${parseList.length}</span>
      <span class="tag success">共同出現在 ${commonPrograms.length} 個規劃書</span>
    </div>
  `;

  const details = allMatches
    .map(({ course, matches }) => {
      const courseItems = matches.map((program) => `${program.programName}（${program.year}學年度／${program.semester}）`).join("； ");
      return `<div class="program-item"><strong>${course}</strong><div class="meta">${courseItems || "未找到對應資料"}</div></div>`;
    })
    .join("");

  const shared = commonPrograms.length
    ? commonPrograms
        .map((program) => {
          const matchedNames = parseList.filter((course) =>
            program.courses.some((item) => normalize(courseName(item)).includes(normalize(course)))
          );
          return `<div class="program-item"><h3>${program.programName}</h3><div class="meta">${program.domain} • ${program.year}學年度 • ${program.semester} • ${program.type}</div><div class="tag-row"><span class="tag">${matchedNames.join("、")}</span></div></div>`;
        })
        .join("")
    : '<p>沒有找到可同時包含這些課程的規劃書。</p>';

  batchResult.innerHTML = `${summary}${details}<h3 style="margin-bottom:6px;">共同出現於同一規劃書</h3>${shared}`;
}

function getUniqueDomains() {
  return [...new Set(microProgramsData.map((program) => program.domain))];
}

function getUniqueYears() {
  return [...new Set(microProgramsData.map((program) => program.year))].sort((a, b) => a - b);
}

function populateFilters() {
  const domainOptions = ['all', ...getUniqueDomains()];

  if (domainFilter) {
    domainFilter.innerHTML = domainOptions
      .map((domain) => `<option value="${domain}">${domain === "all" ? "全部" : domain}</option>`)
      .join("");
  }

  if (yearFilter) {
    const yearOptions = ['all', ...getUniqueYears()];
    yearFilter.innerHTML = yearOptions
      .map((year) => `<option value="${year}">${year === "all" ? "全部" : `${year}學年度`}</option>`)
      .join("");
  }

  if (aggregateDomain) {
    aggregateDomain.innerHTML = domainOptions
      .filter((domain) => domain !== "all")
      .map((domain) => `<option value="${domain}">${domain}</option>`)
      .join("");
  }
}

function getFilteredPrograms() {
  return microProgramsData.filter((program) => {
    const domainMatch = state.selectedDomain === "all" || program.domain === state.selectedDomain;
    const yearMatch = state.selectedYear === "all" || program.year === Number(state.selectedYear);
    return domainMatch && yearMatch;
  });
}

function renderOverviewTable() {
  if (!summaryOverview) return;

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
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${row.domain}</td>
              <td>${row.year}學年度</td>
              <td>${row.programs.length}</td>
              <td>${row.courseCount}</td>
              <td><a class="detail-link" href="detail.html?domain=${encodeURIComponent(row.domain)}&year=${row.year}">查看詳情</a></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
    : '<p>目前沒有可顯示的統計資料。</p>';
}

function renderFullListTree() {
  if (!aggregateResult || !aggregateDomain) return;

  const selectedDomain = aggregateDomain.value;
  const filteredPrograms = microProgramsData.filter((program) => selectedDomain === 'all' || program.domain === selectedDomain);

  if (!filteredPrograms.length) {
    aggregateResult.innerHTML = '<p>目前沒有符合此領域的資料。</p>';
    return;
  }

  const groupedByYear = filteredPrograms.reduce((acc, program) => {
    if (!acc[program.year]) acc[program.year] = [];
    acc[program.year].push(program);
    return acc;
  }, {});

  const yearItems = Object.entries(groupedByYear)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([year, yearPrograms], yearIndex) => {
      const yearId = `year-${yearIndex}`;
      const groupedByType = yearPrograms.reduce((acc, program) => {
        if (!acc[program.type]) acc[program.type] = [];
        acc[program.type].push(program);
        return acc;
      }, {});

      const typeItems = Object.entries(groupedByType)
        .sort(([a], [b]) => a.localeCompare(b, 'zh-Hant'))
        .map(([type, typePrograms], typeIndex) => {
          const typeId = `type-${yearIndex}-${typeIndex}`;
          const programItems = typePrograms
            .map((program, programIndex) => {
              const programId = `program-${yearIndex}-${typeIndex}-${programIndex}`;
              const coursesByCategory = program.courses.reduce((acc, course) => {
                if (!acc[course.category]) acc[course.category] = [];
                acc[course.category].push(course);
                return acc;
              }, {});
              const categoryItems = Object.entries(coursesByCategory)
                .map(([category, courses], categoryIndex) => {
                  const categoryId = `${programId}-category-${categoryIndex}`;
                  return `
                    <div class="tree-node branch course-category">
                      <button class="tree-toggle" data-target="${categoryId}">${category}課程（${courses.length}）</button>
                      <div class="tree-children" id="${categoryId}" style="display:none;">
                        <ul class="tree-course-list">${courses.map((course) => `<li>${displayCourseName(course)}</li>`).join('')}</ul>
                      </div>
                    </div>`;
                })
                .join('');
              const courseContent = categoryItems || '<p class="tree-empty">此規劃書尚未匯入課程資料。</p>';
              return `
                <div class="tree-node branch program-node">
                  <button class="tree-toggle" data-target="${programId}">${program.programName}</button>
                  <div class="tree-meta">${program.semester} • ${program.type}</div>
                  <div class="tree-children" id="${programId}" style="display:none;">${courseContent}</div>
                </div>`;
            })
            .join('');

          return `
            <div class="tree-node branch">
              <button class="tree-toggle" data-target="${typeId}">${type}</button>
              <div class="tree-children" id="${typeId}" style="display:none;">${programItems}</div>
            </div>
          `;
        })
        .join('');

      return `
        <div class="tree-node branch">
          <button class="tree-toggle" data-target="${yearId}">${year}學年度</button>
          <div class="tree-children" id="${yearId}" style="display:none;">${typeItems}</div>
        </div>
      `;
    })
    .join('');

  aggregateResult.innerHTML = yearItems || '<p>目前沒有資料。</p>';

  document.querySelectorAll('.tree-toggle').forEach((button) => {
    button.addEventListener('click', () => {
      const targetId = button.getAttribute('data-target');
      const target = document.getElementById(targetId);
      if (target) {
        const isOpen = target.style.display === 'block';
        target.style.display = isOpen ? 'none' : 'block';
        button.classList.toggle('open', !isOpen);
      }
    });
  });
}

function renderSummary() {
  const filtered = getFilteredPrograms();
  const totalPrograms = filtered.length;
  const totalCourses = filtered.reduce((sum, program) => sum + program.courses.length, 0);
  const domains = [...new Set(filtered.map((program) => program.domain))];
  const years = [...new Set(filtered.map((program) => program.year))].sort((a, b) => a - b);

  if (summaryCards) {
    summaryCards.innerHTML = `
      <div class="summary-card">
        <span>符合條件的微學程</span>
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

  if (summaryOverview) {
    renderOverviewTable();
  }

  if (programList) {
    programList.innerHTML = filtered.length
      ? filtered
          .map((program) => {
            return `
              <div class="program-item">
                <h3>${program.programName}</h3>
                <div class="meta">${program.domain} • ${program.year}學年度 • ${program.semester} • ${program.type}</div>
                <div class="tag-row">
                  <span class="tag">${program.semester}</span>
                  <span class="tag success">${program.year}學年度</span>
                  <span class="tag warn">${program.type}</span>
                </div>
                <ul>${program.courses.map((course) => `<li>${course.category}：${displayCourseName(course)}</li>`).join("")}</ul>
              </div>`;
          })
          .join("")
      : '<p>目前沒有符合條件的資料。</p>';
  }

  if (fullList) {
    renderFullListTree();
  }
}

function renderAggregateView() {
  if (!aggregateDomain || !aggregateResult) return;
  renderFullListTree();
}

if (searchBtn) {
  searchBtn.addEventListener("click", renderSingleSearch);
}

if (courseInput) {
  courseInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") renderSingleSearch();
  });
}

if (batchBtn) {
  batchBtn.addEventListener("click", renderBatchAnalysis);
}

if (domainFilter) {
  domainFilter.addEventListener("change", (event) => {
    state.selectedDomain = event.target.value;
    renderSummary();
  });
}

if (yearFilter) {
  yearFilter.addEventListener("change", (event) => {
    state.selectedYear = event.target.value;
    renderSummary();
  });
}

if (aggregateDomain) {
  aggregateDomain.addEventListener("change", renderAggregateView);
}

loadData();
