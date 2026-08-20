let microProgramsData = [];

function normalizeCourses(courses) {
  if (!Array.isArray(courses)) return [];

  return courses
    .map((course) => {
      if (typeof course === 'string') return { category: '未分類', name: course };
      if (!course || typeof course !== 'object') return null;
      const name = course.name || course.courseName || course.title;
      if (!name) return null;
      const credit = course.credit !== undefined && course.credit !== null ? Number(course.credit) : null;
      return {
        category: course.category || course.type || '未分類',
        name,
        credit: Number.isFinite(credit) ? credit : null
      };
    })
    .filter(Boolean);
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
    } else if (location.protocol === 'file:') {
      console.warn('Running from file://; embedded dataset is required for direct-open mode.');
      microProgramsData = [];
      return;
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
      courses: normalizeCourses(item.courses),
      requirements: item.requirements || {
        totalCredits: null,
        minCoursesPerCategory: { 基礎: 1, 核心: 1, 應用: 1 },
        perCategoryCredits: { 基礎: null, 核心: null, 應用: null }
      }
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
const programLookupInput = document.getElementById("programLookupInput");
const programLookupBtn = document.getElementById("programLookupBtn");
const programLookupResult = document.getElementById("programLookupResult");
const programYearSelect = document.getElementById("programYearSelect");
const programSemesterSelect = document.getElementById("programSemesterSelect");

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
            ${matchedCourses.map((course) => `<li>${course.category}：${formatCourseItem(course)}</li>`).join("")}
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
                <ul>${program.courses.map((course) => `<li>${course.category}：${formatCourseItem(course)}</li>`).join("")}</ul>
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

function getSemesterName(number) {
  if (number === 1) return '第一學期';
  if (number === 2) return '第二學期';
  return null;
}

function getFilteredPrograms() {
  return microProgramsData.filter((program) => {
    const domainMatch = state.selectedDomain === 'all' || program.domain === state.selectedDomain;
    const yearMatch = state.selectedYear === 'all' || program.year === Number(state.selectedYear);
    return domainMatch && yearMatch;
  });
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

  if (summaryOverview) {
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
}

function populateProgramLookup() {
  if (!programYearSelect) return;

  const years = [...new Set(microProgramsData.map((program) => program.year))].sort((a, b) => a - b);
  const options = ['<option value="all">全部</option>']
    .concat(years.map((year) => `<option value="${year}">${year}學年度</option>`))
    .join('');
  programYearSelect.innerHTML = options;
}

function parseProgramLookupQuery() {
  return {
    year: programYearSelect && programYearSelect.value !== 'all' ? Number(programYearSelect.value) : null,
    semester: programSemesterSelect && programSemesterSelect.value !== 'all' ? programSemesterSelect.value : null,
    keyword: programLookupInput ? programLookupInput.value.trim() : ''
  };
}

function resolveProgramLookup(parsed) {
  if (!parsed) return null;

  const keyword = (parsed.keyword || '').replace(/規劃書/g, '').trim();
  const explicitType = keyword.includes('微學程') ? '微學程' : keyword.includes('學分學程') ? '學分學程' : null;
  const keywordMatches = microProgramsData.filter((program) => {
    if (!keyword) return true;
    return normalize(program.programName).includes(normalize(keyword));
  });

  if (!keywordMatches.length) return null;

  const filteredByYear = parsed.year === null ? keywordMatches : keywordMatches.filter((program) => program.year === parsed.year);
  const filteredBySemester = parsed.semester === null ? filteredByYear : filteredByYear.filter((program) => program.semester === parsed.semester);
  const exactMatches = filteredBySemester.length ? filteredBySemester : filteredByYear.length ? filteredByYear : keywordMatches;

  if (explicitType) {
    const typeMatches = exactMatches.filter((program) => program.type === explicitType);
    if (typeMatches.length) return typeMatches[typeMatches.length - 1];
  }

  const microProgramMatches = exactMatches.filter((program) => program.type === '微學程');
  if (microProgramMatches.length) return microProgramMatches[microProgramMatches.length - 1];

  const creditProgramMatches = exactMatches.filter((program) => program.type === '學分學程');
  if (creditProgramMatches.length) return creditProgramMatches[creditProgramMatches.length - 1];

  return exactMatches[exactMatches.length - 1];
}

function getProgramRequirements(program) {
  const requirements = program.requirements || {};
  const totalCredits = Number(requirements.totalCredits);
  const minCoursesPerCategory = requirements.minCoursesPerCategory || { 基礎: 1, 核心: 1, 應用: 1 };
  const perCategoryCredits = requirements.perCategoryCredits || { 基礎: null, 核心: null, 應用: null };

  return {
    totalCredits: Number.isFinite(totalCredits) ? totalCredits : null,
    minCoursesPerCategory,
    perCategoryCredits
  };
}

function renderProgramLookupResult() {
  if (!programLookupInput || !programLookupResult) return;

  const query = parseProgramLookupQuery();
  const keyword = query.keyword.trim();
  if (!keyword && query.year === null && query.semester === null) {
    programLookupResult.innerHTML = '<p>請選擇學年度、學期與微學程名稱。</p>';
    return;
  }

  const program = resolveProgramLookup(query);

  if (!program) {
    programLookupResult.innerHTML = '<p>查無符合條件的規劃書，請確認學年度、學期與微學程名稱是否正確。</p>';
    return;
  }

  const requirementInfo = getProgramRequirements(program);
  const categoryOrder = ['基礎', '核心', '應用'];
  const categoryMap = categoryOrder.reduce((acc, cat) => {
    acc[cat] = program.courses.filter((course) => course.category === cat);
    return acc;
  }, {});

  const cards = categoryOrder.map((category) => {
    const categoryCourses = categoryMap[category] || [];
    const minCourses = requirementInfo.minCoursesPerCategory[category] || 0;
    const requiredCredits = requirementInfo.perCategoryCredits[category];
    const totalCredits = categoryCourses.reduce((sum, course) => {
      const match = String(course.name || '').match(/\((\d+)學分\)|\[(\d+)學分\]|\b(\d+)學分\b/);
      if (match) {
        const credit = Number(match[1] || match[2] || match[3]);
        return sum + (Number.isFinite(credit) ? credit : 0);
      }
      return sum;
    }, 0);
    const requirementText = requiredCredits !== null && requiredCredits !== undefined
      ? `${requiredCredits} 學分`
      : minCourses > 0
        ? `至少 ${minCourses} 門`
        : totalCredits > 0 ? `${totalCredits} 學分` : '未明確標註（目前資料庫未含學分數）';
    const courseList = categoryCourses.length
      ? categoryCourses.map((course) => `<li>${formatCourseItem(course)}</li>`).join('')
      : '<li>此類別目前沒有可顯示課程。</li>';

    return `
      <div class="program-planning-card">
        <h4>${category}</h4>
        <div class="planning-meta">學分要求：${requirementText}</div>
        <ul>${courseList}</ul>
      </div>
    `;
  }).join('');

  const fallbackNote = (query.year !== null && program.year !== query.year) || (query.semester && program.semester !== query.semester)
    ? '<div class="planning-meta">※ 系統以最近符合條件的規劃書內容為主，請確認課程年度與學期。</div>'
    : '';
  const totalRequirementText = requirementInfo.totalCredits !== null
    ? `<div class="planning-meta">完成此微學程需修滿 ${requirementInfo.totalCredits} 學分</div>`
    : '<div class="planning-meta">完成此微學程總學分資訊目前尚未明確標註。</div>';

  programLookupResult.innerHTML = `
    <div class="program-planning-header">
      <h3>${program.programName}</h3>
      <div class="meta">${program.domain} • ${program.year}學年度 • ${program.semester} • ${program.type}</div>
      ${totalRequirementText}
      ${fallbackNote}
    </div>
    <div class="program-planning-grid">${cards}</div>
  `;
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

if (programLookupBtn) {
  programLookupBtn.addEventListener('click', renderProgramLookupResult);
}

if (programLookupInput) {
  programLookupInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') renderProgramLookupResult();
  });
}

if (programYearSelect) {
  programYearSelect.addEventListener('change', renderProgramLookupResult);
}

if (programSemesterSelect) {
  programSemesterSelect.addEventListener('change', renderProgramLookupResult);
}

loadData();

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
