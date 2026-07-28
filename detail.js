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
      const courses = Array.isArray(item.courses) && item.courses.length ? item.courses : [programName];
      return `
        <div class="program-item">
          <h3>${programName}</h3>
          <div class="meta">${item.domain} • ${item.year}學年度 • ${item.semester} • ${item.type}</div>
          <ul>
            ${courses.map((course) => `<li>${course}</li>`).join('')}
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
