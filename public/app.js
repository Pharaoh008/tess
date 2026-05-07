const form = document.querySelector("#scrape-form");
const result = document.querySelector("#result");
const submitButton = document.querySelector("#submit-button");
const exportButton = document.querySelector("#export-button");

let latestRows = [];

function setLoading(done, total) {
  result.className = "result-panel empty";
  result.innerHTML = `
    <div class="loading">
      <div class="spinner" aria-hidden="true"></div>
      <p>正在抓取 Amazon 页面... ${done}/${total}</p>
    </div>
  `;
}

function setError(message) {
  result.className = "result-panel";
  result.innerHTML = `<div class="message">${escapeHtml(message)}</div>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function textOrEmpty(value, fallback = "未抓取到") {
  return value && String(value).trim() ? String(value).trim() : fallback;
}

function parseAsins(value) {
  return [...new Set(
    String(value || "")
      .toUpperCase()
      .split(/[\s,;，；]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  )];
}

async function fetchProduct(country, asin) {
  const response = await fetch(`/api/product?country=${encodeURIComponent(country)}&asin=${encodeURIComponent(asin)}`);
  const payload = await response.json();

  if (!payload.ok) {
    return {
      asin,
      ok: false,
      title: "",
      bullets: [],
      reviewCount: "",
      rating: "",
      image: "",
      url: "",
      marketplace: "",
      error: payload.error || "抓取失败"
    };
  }

  return {
    ok: true,
    error: "",
    ...payload.product
  };
}

function renderTable(rows) {
  const bodyRows = rows.map((row, index) => {
    const bullets = Array.from({ length: 5 }, (_, bulletIndex) => {
      return `<td>${escapeHtml(row.bullets?.[bulletIndex] || "")}</td>`;
    }).join("");

    const imageCell = row.image
      ? `<a href="${escapeHtml(row.image)}" target="_blank" rel="noreferrer"><img class="thumb" src="${escapeHtml(row.image)}" alt="${escapeHtml(row.asin)} 首图"></a>`
      : "未抓取到";

    const titleCell = row.url
      ? `<a href="${escapeHtml(row.url)}" target="_blank" rel="noreferrer">${escapeHtml(textOrEmpty(row.title))}</a>`
      : escapeHtml(textOrEmpty(row.title));

    return `
      <tr class="${row.ok ? "" : "failed-row"}">
        <td>${index + 1}</td>
        <td>${escapeHtml(row.asin)}</td>
        <td>${titleCell}</td>
        <td>${escapeHtml(textOrEmpty(row.rating, ""))}</td>
        <td>${escapeHtml(textOrEmpty(row.reviewCount, ""))}</td>
        ${bullets}
        <td>${imageCell}</td>
        <td>${escapeHtml(row.error || "成功")}</td>
      </tr>
    `;
  }).join("");

  result.className = "result-panel";
  result.innerHTML = `
    <div class="table-header">
      <div>
        <h2>产品对比表</h2>
        <p>共 ${rows.length} 个 ASIN，成功 ${rows.filter((row) => row.ok).length} 个</p>
      </div>
    </div>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>ASIN</th>
            <th>标题</th>
            <th>Rating</th>
            <th>评论数</th>
            <th>五行 1</th>
            <th>五行 2</th>
            <th>五行 3</th>
            <th>五行 4</th>
            <th>五行 5</th>
            <th>首图</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  `;
}

function buildExcelHtml(rows) {
  const header = ["ASIN", "标题", "Rating", "评论数", "五行 1", "五行 2", "五行 3", "五行 4", "五行 5", "首图", "Amazon URL", "状态"];
  const tableRows = rows.map((row) => {
    const cells = [
      row.asin,
      row.title,
      row.rating,
      row.reviewCount,
      row.bullets?.[0] || "",
      row.bullets?.[1] || "",
      row.bullets?.[2] || "",
      row.bullets?.[3] || "",
      row.bullets?.[4] || "",
      row.image,
      row.url,
      row.error || "成功"
    ];

    return `<tr>${cells.map((cell) => `<td>${escapeHtml(cell || "")}</td>`).join("")}</tr>`;
  }).join("");

  return `
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          table { border-collapse: collapse; }
          th, td { border: 1px solid #999; padding: 6px; vertical-align: top; }
          th { background: #e9f3ef; }
        </style>
      </head>
      <body>
        <table>
          <thead><tr>${header.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </body>
    </html>
  `;
}

function exportExcel() {
  if (!latestRows.length) return;

  const html = buildExcelHtml(latestRows);
  const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `amazon-products-${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const data = new FormData(form);
  const country = String(data.get("country") || "").trim();
  const asins = parseAsins(data.get("asins"));
  const invalid = asins.filter((asin) => !/^[A-Z0-9]{10}$/.test(asin));

  if (!asins.length) {
    setError("请至少输入一个 ASIN。");
    return;
  }

  if (invalid.length) {
    setError(`以下 ASIN 格式不正确：${invalid.join(", ")}。ASIN 需要是 10 位字母或数字。`);
    return;
  }

  submitButton.disabled = true;
  exportButton.disabled = true;
  latestRows = [];
  setLoading(0, asins.length);

  try {
    for (const asin of asins) {
      const row = await fetchProduct(country, asin);
      latestRows.push(row);
      setLoading(latestRows.length, asins.length);
    }

    renderTable(latestRows);
    exportButton.disabled = false;
  } catch (error) {
    setError(error.message);
  } finally {
    submitButton.disabled = false;
  }
});

exportButton.addEventListener("click", exportExcel);
