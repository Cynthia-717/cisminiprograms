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

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function renderDetailPage() {
  const domain = getQueryParam('domain');
  const year = getQueryParam('year');
  const detailContent = document.getElementById('detailContent');

  if (!domain || !year) {
    detailContent.innerHTML = '<div class="detail-empty">沒有找到對應資料。</div>';
    return;
  }

  const data = (window.microProgramsDataSeed || []).filter((item) => item.domain === domain && Number(item.year) === Number(year));

  if (!data.length) {
    detailContent.innerHTML = '<div class="detail-empty">目前沒有此領域與學年度的資料。</div>';
    return;
  }

  const items = data
    .map((item) => {
      const programName = cleanProgramName(item.programName);
      const courses = Array.isArray(item.courses) ? item.courses : [];
      return `
        <div class="program-item">
          <h3>${programName}</h3>
          <div class="meta">${item.domain} • ${item.year}學年度 • ${item.semester} • ${item.type}</div>
          <ul>
            ${courses.length ? courses.map((course) => {
              const name = typeof course === 'string'
                ? course
                : [course.prefix, course.name || course.courseName || course.title].filter(Boolean).join(' ');
              const category = typeof course === 'string' ? '未分類' : (course.category || course.type || '未分類');
              const displayName = name.startsWith('數位自學 ')
                ? `<strong>數位自學</strong> - ${name.slice('數位自學 '.length)}`
                : name;
              return `<li>${category}：${displayName}</li>`;
            }).join('') : '<li>此規劃書尚未匯入課程資料。</li>'}
          </ul>
        </div>
      `;
    })
    .join('');

  detailContent.innerHTML = `
    <div class="program-item">
      <h3>${domain} • ${year}學年度</h3>
      <div class="meta">共 ${data.length} 個規劃書</div>
    </div>
    ${items}
  `;
}

renderDetailPage();
