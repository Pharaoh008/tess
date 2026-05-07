const form = document.querySelector("#scrape-form");
const result = document.querySelector("#result");
const button = document.querySelector("#submit-button");
const template = document.querySelector("#product-template");

function setLoading() {
  result.className = "result-panel empty";
  result.innerHTML = `
    <div class="loading">
      <div class="spinner" aria-hidden="true"></div>
      <p>正在抓取 Amazon 页面...</p>
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
  return value && String(value).trim() ? value : fallback;
}

function renderProduct(product) {
  const node = template.content.cloneNode(true);
  const image = node.querySelector("#product-image");
  const bullets = node.querySelector("#bullets");

  node.querySelector("#marketplace").textContent = `${product.marketplace} / ${product.asin}`;
  node.querySelector("#product-link").href = product.url;
  node.querySelector("#product-title").textContent = textOrEmpty(product.title);
  node.querySelector("#rating").textContent = textOrEmpty(product.rating);
  node.querySelector("#review-count").textContent = textOrEmpty(product.reviewCount);

  if (product.image) {
    image.src = product.image;
  } else {
    image.remove();
    node.querySelector(".image-frame").textContent = "未抓取到首图";
  }

  const lines = product.bullets && product.bullets.length ? product.bullets : ["未抓取到五行描述"];
  lines.slice(0, 5).forEach((line) => {
    const item = document.createElement("li");
    item.textContent = line;
    bullets.appendChild(item);
  });

  result.className = "result-panel";
  result.replaceChildren(node);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const data = new FormData(form);
  const country = String(data.get("country") || "").trim();
  const asin = String(data.get("asin") || "").trim().toUpperCase();

  if (!/^[A-Z0-9]{10}$/.test(asin)) {
    setError("ASIN 需要是 10 位字母或数字。");
    return;
  }

  button.disabled = true;
  setLoading();

  try {
    const response = await fetch(`/api/product?country=${encodeURIComponent(country)}&asin=${encodeURIComponent(asin)}`);
    const payload = await response.json();
    if (!payload.ok) {
      throw new Error(payload.error || "抓取失败。");
    }
    renderProduct(payload.product);
  } catch (error) {
    setError(error.message);
  } finally {
    button.disabled = false;
  }
});
